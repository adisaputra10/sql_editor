# SQL Editor - MariaDB & PostgreSQL Admin Tool

SQL Editor a2. Pilih jenis database (MariaDB/MySQL/PostgreSQL)alah aplikasi web untuk mengelola database MariaDB/MySQL dan PostgreSQL, mirip dengan phpMyAdmin atau pgAdmin.

## Fitur

- 🔐 Autentikasi user (data referensi di MariaDB)
- 🗄️ Koneksi ke MariaDB/MySQL dan PostgreSQL
- 📊 Lihat daftar database dan tabel
- ⚡ Eksekusi query SQL
- 🛡️ Masking otomatis data sensitif
- 🎨 Interface web yang user-friendly
- 📱 Responsive design

## Data Security & Masking

Aplikasi ini secara otomatis menyamarkan data sensitif dalam hasil query untuk melindungi informasi pribadi. Kolom yang di-mask meliputi:

- **Nama**: nama, name
- **Email**: email, mail
- **Telepon**: phone, telepon, hp
- **Password**: password, pass
- **Token**: token, secret, key
- **Identitas**: nik, ktp, passport
- **Kartu**: credit_card, card_number

Fitur masking dapat diaktifkan/dinonaktifkan menggunakan toggle di query editor.

## Instalasi

1. Clone repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   ```bash
   cp .env.example .env
   ```

4. Edit file `.env` dengan konfigurasi database Anda

5. Jalankan aplikasi:
   ```bash
   npm start
   ```

6. Akses aplikasi di `http://localhost:3000`

## Konfigurasi

Edit file `.env` untuk mengatur koneksi database:

```
# Server Configuration
PORT=3000
SESSION_SECRET=your-secret-key-here

# MariaDB Configuration (untuk data referensi)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=sql_editor_users

# Default Database Connections
DEFAULT_MARIADB_HOST=localhost
DEFAULT_MARIADB_PORT=3306
DEFAULT_POSTGRES_HOST=localhost
DEFAULT_POSTGRES_PORT=5432
```

## Penggunaan

1. Buka browser dan akses `http://localhost:3000`
2. Login atau register akun baru
3. Pilih jenis database (MySQL/PostgreSQL)
4. Masukkan kredensial database
5. Mulai mengelola database Anda!

## Teknologi

- **Backend**: Node.js, Express.js
- **Database**: MariaDB/MySQL2, PostgreSQL (pg)
- **Frontend**: EJS, Bootstrap, jQuery
- **Security**: bcryptjs, jsonwebtoken, helmet

## License

MIT
