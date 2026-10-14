# zh-dictionary API server: the Go binary from server/ plus the data files.
#   docker build -t zh-dictionary .
#   docker run -p 8080:8080 zh-dictionary
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY server/ .
RUN go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /server .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /server /server
# Data with its license files (the CEDICT and Unicode licenses require them).
COPY data/ /data/
COPY LICENSE /LICENSE
ENV DATA_DIR=/data ADDR=:8080
EXPOSE 8080
ENTRYPOINT ["/server"]
