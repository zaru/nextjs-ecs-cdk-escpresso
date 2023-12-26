# Next.jsをAWS CDKとecspressoでデプロイするサンプル

## 手順

### AWSプロファイルを設定する

```bash
$ export AWS_PROFILE=your-profile
```

### AWS CDKでECSクラスターを作成する

```bash
$ cd cdk
$ npm install
$ npx cdk deploy NextJs-develop
```

- `NextJs-develop`
  以外にステージング・プロダクション用のスタックがある（ `./bin/cdk.ts` を参照）
- CDKではECSのクラスタまでを管理、サービスとタスクはecspressoに任せる

### コンテナイメージを作成し、ECRにpushする

- 運用時ではCIでビルドするが、初回は手動でビルドする
- ECRのリポジトリ名は自動で生成されるので、コンソールもしくはCLIで確認する

```bash
# ECRのURIを取得
$ aws ssm get-parameter --name /ecs/next-js-cdk/ecr-repository-name | jq .Parameter.Value
```

```bash
# Apple Siliconの場合は --platform linux/x86_64 を付ける
$ docker build -t nextjs-aws-cdk-ecspresso -f ./.ecs/app/Dockerfile .

# AWS ECRログインとタグ付けとpush
$ aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin xxxx.dkr.ecr.ap-northeast-1.amazonaws.com
$ docker tag nextjs-aws-cdk-ecspresso:latest xxxx.dkr.ecr.ap-northeast-1.amazonaws.com/<リポジトリ名>:latest
$ docker push xxxx.dkr.ecr.ap-northeast-1.amazonaws.com/<リポジトリ名>:latest
```

### ecspressoでECSサービスとタスクを作成しデプロイ

```bash
$ ecspresso verify
$ ecspresso deploy
```
