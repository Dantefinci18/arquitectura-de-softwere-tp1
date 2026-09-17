FROM node:24
RUN mkdir /opt/app
WORKDIR /opt/app
COPY * ./
COPY state ./state
COPY api ./api
COPY repository ./repository
COPY services ./services
COPY exceptions ./exceptions
RUN npm install
ENTRYPOINT [ "node", "app.js" ]