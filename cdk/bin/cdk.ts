#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NextJsStack } from "../lib/next-js-stack";
import { Config, stages } from "../lib/utils";

const app = new cdk.App();
for (const stage of stages) {
	const config = new Config(stage);
	new NextJsStack(app, config.genId(), {
		// Availability zoneを3つ以上指定するにはアカウントとリージョンを指定する必要がある
		// この環境変数はAWSプロファイルが設定されている場合は自動でセットされる
		env: {
			account: process.env.CDK_DEFAULT_ACCOUNT,
			region: process.env.CDK_DEFAULT_REGION,
		},
	});
}
