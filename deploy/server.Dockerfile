# CoStage 单镜像：Go 单二进制（内嵌 Web 面板 + ZLM 同源反代）+ 转推 bot
# CE 版：relaybot 以 -tags ce 构建（无录制回看，见文档 07 §三）
FROM node:20-alpine AS webbuild
WORKDIR /src
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# 可选 TURN：构建时注入 VITE_TURN_URLS / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL（见 README）
ARG VITE_TURN_URLS
ARG VITE_TURN_USERNAME
ARG VITE_TURN_CREDENTIAL
RUN npm run build

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
# 注入面板产物（嵌入二进制）
COPY --from=webbuild /src/dist ./internal/webui/webdist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/costage-server . \
 && CGO_ENABLED=0 go build -tags ce -ldflags="-s -w" -o /out/relaybot ./cmd/relaybot

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/costage-server /app/costage-server
COPY --from=build /out/relaybot /app/relaybot
WORKDIR /app
# 单入口：面板 + API/WS + WHEP 同源（COSTAGE_ADDR=:80）
ENV COSTAGE_ADDR=:80
EXPOSE 80
ENTRYPOINT ["/app/costage-server"]
