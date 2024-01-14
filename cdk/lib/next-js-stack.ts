import {
  Duration,
  Stack,
  StackProps,
  aws_route53_targets as targets, RemovalPolicy,
} from "aws-cdk-lib";
import {FederatedPrincipal, ManagedPolicy, PolicyDocument, Role, ServicePrincipal, OpenIdConnectProvider} from "aws-cdk-lib/aws-iam";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ses from "aws-cdk-lib/aws-ses";

export class NextJsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // cdk.jsonで定義した環境ごとの定数を参照
    const envKey = scope.node.tryGetContext("environment");
    const envValues = scope.node.tryGetContext(envKey) as {
      [key: string]: string;
    };

    // VPC
    const vpc = new Vpc(this, "Vpc", { maxAzs: 3 });
    const subnetIdList = vpc.privateSubnets.map((obj) => obj.subnetId);

    // Route53 + ACMで証明書管理
    // 既存のRoute53ホストゾーンを使う場合はこちらでhostedZoneIdを指定する
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "hostedzone",
      {
        hostedZoneId: envValues.hostedZoneId,
        zoneName: envValues.zoneName,
      },
    );
    // 新規でRoute53ホストゾーンを作成する場合はこちら
    // const hostedZone = new route53.HostedZone(this, "HostedZone", {
    // 	zoneName: envValues.zoneName,
    // });
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: envValues.domainName,
      certificateName: "Next.js CDK Sample",
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // セキュリティグループ
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc,
      allowAllOutbound: true,
    });
    albSg.addIngressRule(ec2.Peer.ipv4("0.0.0.0/0"), ec2.Port.tcp(443));

    const containerSg = new ec2.SecurityGroup(this, "ContainerSg", { vpc });
    albSg.connections.allowTo(containerSg, ec2.Port.tcp(3000));

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
    });

    // ターゲットグループ
    const containerTg = new elbv2.ApplicationTargetGroup(this, "ContainerTg", {
      targetType: elbv2.TargetType.IP,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      // ヘルスチェックをカスタマイズする
      healthCheck: {
        path: "/api/health",
        healthyHttpCodes: "200",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        interval: Duration.seconds(10),
        timeout: Duration.seconds(5),
      },
      vpc,
    });

    // ALBリスナー
    alb.addListener("Listener-HTTPS", {
      defaultTargetGroups: [containerTg],
      open: true,
      port: 443,
      certificates: [certificate],
    });

    // ALBをRoute53に登録
    new route53.ARecord(this, "EcsAlbRecord", {
      zone: hostedZone,
      recordName: envValues.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(alb),
      ),
    });

    // ECSクラスタ
    const cluster = new Cluster(this, "EcsCluster", {
      vpc,
      clusterName: "NextJsCluster",
    });

    // タスクロール
    const taskRole = new Role(this, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // タスク実行ロール
    const taskExecRole = new Role(this, "TaskExecRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonEC2ContainerRegistryReadOnly",
        ),
      ],
      inlinePolicies: {
        inlinePolicies: PolicyDocument.fromJson({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "secretsmanager:GetSecretValue",
              Resource: ["*"],
            },
          ],
        }),
      },
    });

    // ロググループ
    const logGroup = new LogGroup(this, "logGroup", {});

    // ECR
    const repository = new Repository(this, "Repository", {
      removalPolicy: RemovalPolicy.DESTROY
    });

    // タスク実行ロールに権限付与
    repository.grantPull(taskExecRole);
    logGroup.grantWrite(taskExecRole);

    // SES設定
    new ses.EmailIdentity(this, "Identity", {
      identity: ses.Identity.publicHostedZone(hostedZone),
      mailFromDomain: `bounce.${envValues.domainName}`,
    });
    new route53.TxtRecord(this, "DmarcRecord", {
      zone: hostedZone,
      recordName: `_dmarc.${envValues.domainName}`,
      values: ["v=DMARC1; p=none"],
      ttl: Duration.hours(1),
    });

    // SSMパラメータの設定(ecspressoから参照する)
    new ssm.StringParameter(this, "TaskRoleParam", {
      parameterName: "/ecs/next-js-cdk/task-role",
      stringValue: taskRole.roleArn,
    });
    new ssm.StringParameter(this, "TaskExecRoleParam", {
      parameterName: "/ecs/next-js-cdk/task-exec-role",
      stringValue: taskExecRole.roleArn,
    });
    for (let i = 0; i < subnetIdList.length; i++) {
      new ssm.StringParameter(this, `ContainerSubnetParam${i}`, {
        parameterName: `/ecs/next-js-cdk/subnet-id-${i}`,
        stringValue: subnetIdList[i],
      });
    }
    new ssm.StringParameter(this, "ContainerSgParam", {
      parameterName: "/ecs/next-js-cdk/sg-id",
      stringValue: containerSg.securityGroupId,
    });
    new ssm.StringParameter(this, "ContainerTgParam", {
      parameterName: "/ecs/next-js-cdk/tg-arn",
      stringValue: containerTg.targetGroupArn,
    });
    new ssm.StringParameter(this, "LogGroupParam", {
      parameterName: "/ecs/next-js-cdk/log-group-name",
      stringValue: logGroup.logGroupName,
    });
    new ssm.StringParameter(this, "EcrRepositoryName", {
      parameterName: "/ecs/next-js-cdk/ecr-repository-name",
      stringValue: repository.repositoryUri,
    });

    // GitHub ActionsからAWSへアクセスできるOIDCとロールを作成
    const gitHubIdProvider = new OpenIdConnectProvider(
      this,
      "GitHubIdProvider",
      {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      },
    );
    new Role(this, "GitHubActionsOidcRole", {
      roleName: "github-actions-oidc-role",
      assumedBy: new FederatedPrincipal(
        gitHubIdProvider.openIdConnectProviderArn,
        {
          StringLike: {
            "token.actions.githubusercontent.com:sub": envValues.githubOidcRepo,
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
      inlinePolicies: {
        inlinePolicies: PolicyDocument.fromJson({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "GitHubActionsPolicy",
              Effect: "Allow",
              Action: [
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:BatchCheckLayerAvailability",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage",
                "ecr:GetAuthorizationToken",
                "ecr:ListImages",
                "application-autoscaling:Describe*",
                "application-autoscaling:Register*",
                "codedeploy:BatchGet*",
                "codedeploy:CreateDeployment",
                "codedeploy:List*",
                "ecs:*",
                "elasticloadbalancing:DescribeTargetGroups",
                "iam:GetRole",
                "iam:PassRole",
                "logs:GetLogEvents",
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
                "servicediscovery:GetNamespace",
                "ssm:GetParameter*",
                "sts:AssumeRole",
              ],
              Resource: "*",
            },
          ],
        }),
      },
    });
  }
}
