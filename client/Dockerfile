FROM node:20

WORKDIR /app

COPY . /app

RUN npm install \
 && apt-get update \
 && apt-get install -y openssl \
 && openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /app/key.pem -out /app/cert.pem \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

EXPOSE 5173

CMD ["npm", "run", "dev"]
