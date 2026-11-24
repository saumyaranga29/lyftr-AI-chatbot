.PHONY: up down build test clean

up:
	docker compose up -d --build

down:
	docker compose down

build:
	docker compose build

test:
	docker compose run --rm backend pytest tests/test_api.py -v

clean:
	docker compose down -v
