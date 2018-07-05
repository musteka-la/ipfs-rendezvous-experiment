FROM node:9
MAINTAINER dryajov

# setup app dir
RUN mkdir -p /rendezvous/
WORKDIR /rendezvous/

# install dependencies
COPY ./package.json /rendezvous/package.json
RUN npm install

# copy over app dir
COPY ./src /rendezvous/src

# start server
CMD npm run start

# expose server
EXPOSE 30333
EXPOSE 30334
