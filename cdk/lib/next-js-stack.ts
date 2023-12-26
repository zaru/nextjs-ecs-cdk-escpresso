import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { LogGroup } from "aws-cdk-lib/aws-logs";

export class NextJsStack extends Stack {
	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props);

		// VPC
		const vpc = new Vpc(this, "Vpc", { maxAzs: 3 });
		const subnetIdList = vpc.privateSubnets.map((obj) => obj.subnetId);

		// セキュリティグループ
		const albSg = new ec2.SecurityGroup(this, "AlbSg", {
			vpc,
			allowAllOutbound: true,
		});
		albSg.addIngressRule(ec2.Peer.ipv4("0.0.0.0/0"), ec2.Port.tcp(80));

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
			vpc,
		});

		// ALBリスナー
		alb.addListener("Listener", {
			defaultTargetGroups: [containerTg],
			open: true,
			port: 80,
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
		});

		// ロググループ
		const logGroup = new LogGroup(this, "logGroup", {});

		// ECR
		const repository = new Repository(this, "Repository", {});

		// タスク実行ロールに権限付与
		repository.grantPull(taskExecRole);
		logGroup.grantWrite(taskExecRole);

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
	}
}
