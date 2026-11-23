# Optional: run the game server in a container (e.g. on a cloud VM, reachable by its IP, no domain needed)
FROM python:3.12-slim
WORKDIR /app
COPY . /app
EXPOSE 8000
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8000"]
