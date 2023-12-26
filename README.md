# Next.jsをAWS CDKとecspressoでデプロイするサンプル

## 概要

- AWS CDKでECSクラスタを管理
- ECSサービスとタスクはecspressoで管理
- ACMは手動で管理し、CDKで管理する

## 手順

### AWSプロファイルを設定する

```bash
$ export AWS_PROFILE=your-profile
```

### AWS CDKでECSクラスターを作成する

```bash
$ cd cdk
$ npm install
$ npx cdk diff -c environment=develop
```

- `develop`
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
# コンテナ名をAWSパラメータストアから取得
$ export IMAGE_NAME=$(aws ssm get-parameter --name /ecs/next-js-cdk/ecr-repository-name | jq -r '.Parameter.Value|split("/")[-1]')
$ docker build -t $IMAGE_NAME -f ./.ecs/app/Dockerfile . # Apple Siliconの場合は --platform linux/x86_64 を付ける

# AWS ECRログインとタグ付けとpush
$ export REPO_NAME=$(aws ssm get-parameter --name /ecs/next-js-cdk/ecr-repository-name | jq -r '.Parameter.Value|split("/")[0]')
$ aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin $REPO_NAME
$ docker tag $IMAGE_NAME:latest $REPO_NAME/$IMAGE_NAME:latest
$ docker push $REPO_NAME/$IMAGE_NAME:latest
```

### ecspressoでECSサービスとタスクを作成しデプロイ

```bash
$ ecspresso verify
$ ecspresso deploy
```

## TODO

- [ ] GitHub Actions
- [ ] ヘルスチェックのカスタマイズ
- [ ] 秘匿情報をSSMに設定する
