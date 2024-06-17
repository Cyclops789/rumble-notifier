FROM node:20-alpine

RUN mkdir -p /app/node_modules && chown -R node:node /app

WORKDIR /app

COPY package.json ./

COPY yarn.lock ./

RUN yarn

COPY . .

CMD ["node", "rumble.js"]