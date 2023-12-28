import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NextJsStack } from '../lib/next-js-stack';
test("SQS Queue Created", () => {
  const app = new cdk.App({
    context: {
      environment: "develop",
      develop: {
        zoneName: "develop.example.com",
        hostedZoneId: "in your Route53 hosted zone id",
        domainName: "nextjs.develop.example.com"
      }
    }
  });
  const stack = new NextJsStack(app, 'NextJsStackTest');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::EC2::VPC', 1)

  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    SecurityGroupIngress: [
      {
        CidrIp: '0.0.0.0/0',
        FromPort: 80,
        ToPort: 80,
        IpProtocol: 'tcp'
      },
      {
        CidrIp: '0.0.0.0/0',
        FromPort: 443,
        ToPort: 443,
        IpProtocol: 'tcp'
      }
    ]
  });
});
