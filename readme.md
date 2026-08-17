# Local commands

```sh
docker build -t my_image:1.0 .

docker rm -f my_app

docker create --name my_app -p 3000:3000 my_image:1.0
docker create --name my_app --env-file .env -p 3000:3000 my_image:1.0

docker start my_app

curl http://localhost:3000/
curl http://localhost:3000/ping
```
