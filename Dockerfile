# base stage
FROM node:16 as base
WORKDIR /app

COPY . /app
COPY package.json yarn.lock ./
RUN yarn install

ENV PORT 8084
EXPOSE 8084
ENTRYPOINT ["yarn", "start"]
