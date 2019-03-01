FROM node:8

# TODO for testing ...

# Create app directory
WORKDIR /application

RUN mkdir -p /programs


RUN apt-get update
RUN curl -O https://dl.minio.io/server/minio/release/linux-amd64/minio
RUN ls
RUN chmod +x minio
RUN mv minio /programs/minio


# Bundle app source
COPY . .
RUN ls

EXPOSE 8080