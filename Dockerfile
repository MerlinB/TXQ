FROM node:14

WORKDIR /code

COPY package*.json /code/

RUN npm install

COPY . /code/
# COPY config.js /code/src/cfg/
RUN touch /code/.env

RUN npm run build

ENV PORT=8097

EXPOSE 8097

CMD ["node", "./dist/bootstrap/index.js"]