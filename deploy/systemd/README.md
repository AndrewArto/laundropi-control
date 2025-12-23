# LaundroPi systemd units

Шаблоны сервисов для автозапуска API и фронта при загрузке.

## Что делают
- `laundropi-api.service` — запускает `node server.js` (API на 3001).
- `laundropi-ui.service` — запускает `npm run preview -- --host --port 3000` (раздаёт собранный UI).

## Подготовка
1) Один раз установить зависимости и собрать UI:
```
npm install
npm run build
```
2) При необходимости поправить `User` и `WorkingDirectory` в `.service` под свой юзер/путь.
   По умолчанию: `User=pi`, `WorkingDirectory=%h/Projects/Laundry/laundropi-control`.

## Установка и автозапуск
Скопируйте юниты в systemd, перезагрузите демона и включите автозапуск:
```
sudo cp deploy/systemd/laundropi-api.service /etc/systemd/system/
sudo cp deploy/systemd/laundropi-ui.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now laundropi-api.service
sudo systemctl enable --now laundropi-ui.service
```

## Проверка и логи
```
systemctl status laundropi-api.service
systemctl status laundropi-ui.service
journalctl -u laundropi-api.service -f
journalctl -u laundropi-ui.service -f
```

Фронт будет доступен на `:3000`, API на `:3001`.

