#!/bin/zsh

docker stop cordverif || false
docker rm cordverif || false

docker build -t cordverif:local .
docker run -dt -p 8084:8084 --name cordverif cordverif:local
