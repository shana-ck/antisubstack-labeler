FROM node:24-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 14831

EXPOSE 14833

CMD ["node", "--max-old-space-size=2048", "labeler.ts"]