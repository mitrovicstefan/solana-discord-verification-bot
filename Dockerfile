# base stage
FROM node:14 as base
WORKDIR /app

RUN yarn global add @vue/cli

RUN env

COPY package.json yarn.lock ./
RUN yarn
COPY . /app
EXPOSE 8084
CMD ['yarn', 'dev']
