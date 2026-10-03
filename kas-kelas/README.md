# Kas Kelas (versi lengkap: siswa, target, Semester 1 & 2)

Frontend (HTML/CSS/JS) → Google Apps Script Web App → Google Sheets. Tidak ada database lain.

## Sheet yang dibaca (nama harus persis sama)
| Sheet | Isi |
|---|---|
| `Semester 1 (Agt-Des)` | Mulai baris 5: A=No, B=NIS, C=Nama, D–H = Agustus–Desember |
| `Semester 2 (Jan-Jun)` | Mulai baris 5: A=No, B=NIS, C=Nama, D–I = Januari–Juni |
| `Pengeluaran Kas` | Mulai baris 4: A=No, B=Tanggal, C=Keterangan, D=Kategori, E=Jumlah, F=Penanggung Jawab |

Sheet `Dashboard & Rekap` tidak dibaca; semua total dihitung ulang di server dari data mentah, jadi rumus/angka manual yang salah di sheet tidak memengaruhi website. NIS tidak ditampilkan di website.

## Menghubungkan
1. Upload `Format_Uang_Kas_Kelas_45_Siswa.xlsx` ke Google Drive → buka dengan Google Sheets (atau File → Import).
2. Di spreadsheet: **Extensions → Apps Script**. Ganti isi `Code.gs` dengan `google-apps-script/Code.gs`.
3. Ganti `SPREADSHEET_ID` di atas file dengan ID spreadsheet itu (bagian antara `/d/` dan `/edit` di URL).
4. Sesuaikan `CLASS_NAME`, `YEAR`, `FEE` (iuran) bila perlu. **Save**.
5. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone** → Deploy → Authorize → salin URL `/exec`.
6. Tempel URL ke `CONFIG.API_URL` di `script.js`, buka `index.html`.
7. Tes: status hijau "Terhubung", catat satu pembayaran, cek selnya berubah di sheet; tambah satu pengeluaran, cek baris barunya.

Edit `Code.gs` lagi? **Deploy → Manage deployments → pensil → New version → Deploy** (URL tetap).

## Aturan dan catatan
- Status siswa: **LUNAS** jika total semester ≥ iuran × jumlah bulan semester (Sem 1: Rp 150.000, Sem 2: Rp 180.000). Kolom Status di sheet tidak dipakai/ditimpa.
- Target 1 tahun = jumlah siswa × iuran × 11 bulan. Saldo = terkumpul − pengeluaran.
- Catat Pembayaran **menambah** nilai sel bulan itu; ditolak jika melebihi iuran bulanan.
- Tambah Pengeluaran menyisipkan baris baru **di bawah data terakhir** (baris TOTAL tetap di bawah). Tanggal baru disimpan `yyyy-MM-dd`.
- `FIX_SWAPPED_DATES = true`: sel tanggal asli di sheet pengeluaran yang hari-bulannya tertukar (mis. 12/08 terbaca 8 Des) dibalik otomatis. Lebih baik ketik ulang sel tersebut sebagai teks `dd/mm/yyyy`, lalu set `false`.
- Rumus TOTAL di sheet Pengeluaran Kas (`SUM(E4:E27)`) tidak mencakup baris terakhir; website tidak terpengaruh, tapi sebaiknya diperbaiki.
- **Privasi:** karena Web App "Anyone", siapa pun yang punya URL bisa melihat nama dan pembayaran siswa dan bisa mengirim data. Rahasiakan URL. PIN di JavaScript tidak aman sehingga tidak dipakai.
