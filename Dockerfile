FROM node:6.5.0

RUN \
  apt-get update 

# Attempt to always use latest Docker here
RUN \
  curl -o /tmp/docker.tgz https://test.docker.com/builds/Linux/x86_64/docker-1.12.0.tgz && \
  tar -xz -C /tmp -f /tmp/docker.tgz && \
  mv /tmp/docker/* /usr/bin/ && \
  rm -rf /tmp/docker.tgz /tmp/docker

COPY /src /src
COPY package.json package.json
COPY server.js server.js

RUN \
  npm install

EXPOSE 8080

ENTRYPOINT ["npm"]
CMD ["start"]
