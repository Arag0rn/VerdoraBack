# 🚀 Инструкция по запуску Google OAuth локально

## ✅ Что сделано:

1. ✅ Клонирован бэкенд в `d:\Repo\VerdoraBack-local`
2. ✅ Добавлена поддержка Google OAuth (Passport.js)
3. ✅ Созданы файлы:
   - `config/passport.js` - конфигурация Google OAuth
   - `controllers/googleAuthController.js` - обработчик callback
   - `.env` - переменные окружения
4. ✅ Обновлены роуты и middleware
5. ✅ Зависимости установлены (`npm install`)
6. ✅ Фронтенд настроен на `http://localhost:4000`

---

## 📋 Шаги для запуска:

### **Шаг 1: Настройте MongoDB**

Выберите один из вариантов:

**Вариант А: Локальный MongoDB**
```bash
# Установите MongoDB Community Edition
# https://www.mongodb.com/try/download/community

# Запустите MongoDB (обычно запускается автоматически)
mongod

# .env уже настроен на: mongodb://localhost:27017/verdora
```

**Вариант Б: MongoDB Atlas (бесплатно)**
1. Создайте аккаунт на https://www.mongodb.com/cloud/atlas
2. Создайте бесплатный кластер (M0)
3. Получите connection string
4. Обновите в `.env`: `MONGO_URI=mongodb+srv://...`

---

### **Шаг 2: Настройте Google OAuth**

1. **Откройте [Google Cloud Console](https://console.cloud.google.com/)**

2. **Создайте проект** (если нет):
   - Нажмите на выпадающее меню вверху
   - "New Project" → введите "Verdora" → Create

3. **Настройте OAuth consent screen**:
   - APIs & Services → OAuth consent screen
   - External → Create
   - App name: `Verdora`
   - User support email: ваш email
   - Developer contact: ваш email
   - Save and Continue → Save and Continue → Save and Continue

4. **Создайте OAuth 2.0 Client ID**:
   - APIs & Services → Credentials
   - "+ CREATE CREDENTIALS" → OAuth client ID
   - Application type: **Web application**
   - Name: `Verdora Local Dev`
   - **Authorized redirect URIs** → Add URI:
     ```
     http://localhost:4000/auth/google/callback
     ```
   - CREATE

5. **Скопируйте credentials**:
   - Откроется окно с Client ID и Client Secret
   - Обновите в `d:\Repo\VerdoraBack-local\.env`:
     ```env
     GOOGLE_CLIENT_ID=ваш_client_id
     GOOGLE_CLIENT_SECRET=ваш_client_secret
     ```

---

### **Шаг 3: Запустите бэкенд**

```bash
cd /d/Repo/VerdoraBack-local
npm start
```

Должно появиться:
```
Verdora backend listening on http://localhost:4000
MongoDB connected successfully
```

---

### **Шаг 4: Запустите фронтенд**

Откройте **новый терминал**:

```bash
cd d:\Repo\Front-end-Verdora
npm run dev
```

Откройте: `http://localhost:5173`

---

## 🧪 Тестирование Google OAuth:

1. **Откройте http://localhost:5173/login**

2. **Откройте DevTools (F12) → Network tab**

3. **Нажмите "Continue with Google"**

4. **Отследите поток**:
   ```
   1. Frontend → Backend:
      GET http://localhost:4000/auth/google
      → 302 redirect to Google

   2. Google consent screen
      → User clicks "Allow"

   3. Google → Backend:
      GET http://localhost:4000/auth/google/callback?code=...
      → Backend создает JWT tokens

   4. Backend → Frontend:
      302 Redirect to http://localhost:5173
      Set-Cookie: accessToken=...
      Set-Cookie: refreshToken=...
   ```

5. **Проверьте cookies**:
   - DevTools → Application → Cookies → `http://localhost:4000`
   - Должны быть: `accessToken` и `refreshToken`

6. **Проверьте авторизацию**:
   - После редиректа должны увидеть главную страницу
   - В шапке должна появиться аватарка и кнопка "Sign Out"

---

## 🔍 Проверка MongoDB:

После успешной авторизации проверьте, что пользователь создан:

```bash
# Подключитесь к MongoDB
mongosh

# Выберите БД
use verdora

# Проверьте пользователей
db.users.find().pretty()

# Вы должны увидеть:
{
  "_id": ObjectId("..."),
  "name": "Your Name",
  "email": "your@gmail.com",
  "phone": "",
  "password": "GOOGLE_OAUTH_USER",
  "createdAt": ISODate("...")
}
```

---

## 🐛 Troubleshooting:

### **Ошибка: "MongoDB connection failed"**
- Убедитесь, что MongoDB запущен
- Проверьте `MONGO_URI` в `.env`
- Для Atlas: добавьте IP в Network Access (0.0.0.0/0)

### **Ошибка: "redirect_uri_mismatch" от Google**
- В Google Console проверьте, что добавлен:
  `http://localhost:4000/auth/google/callback`
- Точное совпадение (без trailing slash)

### **Cookies не устанавливаются**
- Проверьте, что оба сервера на HTTP (не смешивайте HTTP/HTTPS)
- В браузере разрешите cookies для localhost

### **CORS ошибка**
- Проверьте `.env` бэкенда:
  `FRONTEND_ORIGIN=http://localhost:5173`
- Убедитесь, что фронтенд на порту 5173

---

## 📝 Структура файлов:

```
VerdoraBack-local/
├── config/
│   └── passport.js          # ✅ Google OAuth конфигурация
├── controllers/
│   ├── authController.js    # Email/password auth
│   └── googleAuthController.js  # ✅ Google OAuth callback
├── models/
│   ├── User.js
│   └── RefreshToken.js
├── routes/
│   └── auth.js              # ✅ Обновлено: добавлены Google роуты
├── .env                     # ✅ Ваши настройки
└── index.js                 # ✅ Обновлено: подключен passport
```

---

## ✨ Следующие шаги:

После успешного тестирования локально:

1. **Добавьте production credentials** для Render
2. **Обновите Google Console** с production URLs
3. **Деплой на Render** с новыми env vars

Успехов! 🚀
