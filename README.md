# CDK Template
Pitaya CDK template 😃 (in Typescript)

## Tables of contents
- [Background](#background)
- [Requirements](#requirements)
- [Stacks structure](#stacks-structure)
- [Files structure](#files-structure-and-its-meaning)
- [Commands](#commands)
- [Future improvements](#future-improvements)

## Background
I don't want to initiate a blank CDK project anymore. So this is what I created.

You can use this to deploy infra from your machine, or even with a CDK pipeline with just a little twist!

## Requirements
Of course a PC (I'm using MacOS, so installation guide gonna be for MacOS)

1. AWS CLI

    https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
2. npm
3. CDK Typescript
    ```sh
    npm -g install typescript    
    ```
4. AWS Credential (I will use AWS SSO Account with --profile flag)

## Stacks structure
The template include 3 major stacks, and will be (should be deploy in exact sequent):
- Base Network
- Stateful Resources
- Stateless Resources

Optional stack:
- Non Production

This is just an example stack. In this stack I created automation to shut down resources temporary outside business hour (not meant to use in production)

You can deploy Stateful or Stateless independently, but they will still be depended on BaseNetwork stack .<bR>
In other word, BaseNetwork will be created no matter which stack you create first.

You can extend to more subsequent stacks. But the less stacks the better.

## Stages 
Stage can be consider a sub set of CDK project. I define it's a development environment.

Which mean each stage represent an environment of our project.

Each stage can have just one or multiple stacks, which will be define in each stage's file.

**⚠️⚠️⚠️Please also keep in mind that this stack will be deploy in Tokyo Region as default⚠️⚠️⚠️**<br>
Set different region in .env file if needed to.

A visualization of stack order for one stage and its dependency:

![stacks](/stacks.png)
## Files structure and its meaning
```sh
pitaya-cdk-template
├── assets
│   └── lambda-code.py #example lambda function's code
├── bin
│   └── pitaya-cdk-template.ts # entry point, stacks and stages will be loaded here
├── lib 
│   ├── parameters #parameters for stacks
│   │   ├── constants.ts #constants through out project
│   │   └── env-config.ts #load parameter from .env.${deployEnv} files below
│   ├── stacks #stacks' definition folder
│   │   ├── base-network.ts #BaseNetwork Stack
│   │   ├── non-production.ts #Non Production Stack
│   │   ├── stateful-resources.ts #Stateful Stack
│   │   └── stateless-resources.ts #Stateless Stack
│   └── stages #deployment stages folder
│       ├── dev.ts #Development Stage
│       └── prod.ts #Production Stage
├── .env.dev #parameters for dev environment
├── .env.stg #parameters for stg environment
└── .env.prod #parameters for prod environment
```

## Commands

### Git clone and bootstrap cdk to your AWS account
```sh
# Clone project
git clone git@github.com:long2205/pitaya-cdk-template.git
```

Register account ID (and default region) in lib/constants.ts
```sh
# Bootstrap to your AWS
cdk bootstrap --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦
```

### Deploy stacks
Stacks will be deploy in sequential order.

Deploy commands with development environment:
```sh
# Deploy every stacks of Development stage
cdk deploy "Development/**" --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 

# Deploy Base Network
cdk deploy Development/BaseNetwork --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 

# Deploy Stateless resources
cdk deploy Development/StatelessResource --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 
# Stateless stack is depended on BaseNetwork Stack. Hence when deploy, it also deploys/check changes of BaseNetwork Stack. Same thing happen with Stateful Stack.
```

### Delete stacks
Sometimes, you need to re-create stack. Or your business is gone and you need to delete it. 

Deleting stacks should be delete by later-most order.

Which means the latest stack should be delete first, then the upmost BaseNetwork stack will be delete.

```sh
cdk destroy Development/StatelessResource --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 

cdk destroy Development/BaseNetwork --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 
# If you only run BaseNetwork delete command, all stacks will be delete, not just BaseNetwork stack

# This command will delete everything in Development stage, latest stack to oldest.
cdk destroy "Development/**" --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 
```

## Future improvements
- Wrapped all the stages into a [CDK Pipeline](https://docs.aws.amazon.com/cdk/v2/guide/cdk_pipeline.html) 

(This is the main reason I put parameters into .env file, but for now I still prefer control from local machine)
- Introduce [cdk-nag](https://github.com/cdklabs/cdk-nag)