FROM node:24
RUN mkdir /opt/app
WORKDIR /opt/app
COPY * ./
RUN npm install
ENTRYPOINT [ "node", "app.js" ]