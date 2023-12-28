import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { NextJsStack} from "../lib/next-js-stack";

test("snapshot test", () => {
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
  const stack = new NextJsStack(app, "NextJsStackTest");
  const template = Template.fromStack(stack).toJSON();
  expect(template).toMatchSnapshot();
});
