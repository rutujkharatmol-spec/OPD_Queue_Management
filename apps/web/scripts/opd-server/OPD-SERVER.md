# OPD server on the hospital network

Today every computer uses the Vercel website, so when the hospital's internet fails,
each computer works alone: patients registered at the desk do not reach the doctors'
screens until the internet is back.

With an OPD server, one PC inside the hospital runs the system for every registration
desk, doctor PC and TV over the hospital network. The internet is no longer needed for
the clinic to run. That PC also sends a live copy up to the cloud every few seconds, so
patients can still follow the queue on their phones through the usual website.

```
 Registration PCs ─┐
 Doctor PCs ───────┼── hospital network ──> OPD server (mini-PC) ──internet──> Neon ──> Vercel ──> patients' phones
 TV boards ────────┘                         app + database + backups           (copy)     (read-only)
```

## What you need

- A small PC that stays on all day (any Windows 10/11 mini-PC with 8 GB RAM is plenty),
  connected to the hospital network by cable, ideally on a UPS.
- On it: **Node.js 22 LTS** (nodejs.org) and **PostgreSQL 18** (postgresql.org, Windows
  installer; remember the password it asks for the `postgres` user).
- **Git** (git-scm.com), to get the app: `git clone https://github.com/rutujkharatmol-spec/OPD_Queue_Management.git C:\OPD`
- A **fixed address** for this PC on the network: ask IT to reserve its IP address in
  the router (DHCP reservation). Every computer will bookmark that address.

## Switching over (one evening, after OPD hours)

Do these in order. The clinic keeps using Vercel until step 4.

1. **Stop changes on Vercel.** In Vercel > Settings > Environment Variables add
   `READ_ONLY_MIRROR` = `true` and `OPD_SERVER_URL` = `http://<server IP>:3000`, then
   redeploy. Patients' phones keep working; staff screens on Vercel show a banner
   pointing to the OPD server.
2. **Set up the server.** On the mini-PC, open PowerShell as Administrator and run:
   ```
   powershell -ExecutionPolicy Bypass -File "C:\OPD\apps\web\scripts\opd-server\setup.ps1"
   ```
   It asks for the `postgres` password, the Neon connection string (Neon console >
   Connect), and the staff and admin passwords (use the same ones as on Vercel). It
   copies all data from Neon, builds the app, starts it at every boot, opens port 3000,
   schedules nightly backups to `C:\OPD-Backups`, and prints the addresses to use.
3. **Check the copy to the cloud.** On the mini-PC, open
   `http://localhost:3000/admin`, log in, then open
   `http://localhost:3000/api/v1/admin/sync-status`. It should say `"healthy":true`.
4. **Move every computer.** On each registration and doctor PC, open
   `http://<server IP>:3000/registration` (or `/doctor`), log in with the staff
   password and bookmark it. On TV PCs run
   `scripts\start-tv-display.bat "http://<server IP>:3000/tv"`.

Patient QR codes and the website address for patients do not change.

### Going back to Vercel, if needed

In Vercel remove `READ_ONLY_MIRROR` and redeploy, then on the mini-PC run
`Disable-ScheduledTask -TaskName "OPD Server"`. Nothing is lost: everything done on
the OPD server was already copied to Neon.

## Day to day

- **The mini-PC must stay on.** If it is switched off, the screens fall back to working
  alone (as during an internet outage today) and catch up when it is back.
- **Internet outage:** nothing changes for staff. Patients' phones stop updating until
  the internet returns; the copy then catches up by itself.
- **Is the cloud copy working?** `/api/v1/admin/sync-status` (admin login).
- **Backups:** `C:\OPD-Backups`, one file per night, 14 days kept; `backup.log` lists
  each run. Copy them to a USB drive now and then. Restoring: `scripts\BACKUPS.md`.
- **Server log:** `C:\ProgramData\OPD-Server\server.log`.

## Updating

After OPD hours, on the mini-PC as Administrator:

```
powershell -ExecutionPolicy Bypass -File "C:\OPD\apps\web\scripts\opd-server\update.ps1"
```

If the update adds a folder under `apps\web\prisma\migrations`, first run its
`migration.sql` on **both** databases, the mini-PC's and Neon's. Neither database
tracks migrations automatically:

```
"C:\Program Files\PostgreSQL\18\bin\psql" -U opd -d opd -f "C:\OPD\apps\web\prisma\migrations\<folder>\migration.sql"
```

and paste the same file into the Neon SQL editor. If Neon is behind, the cloud copy
stops and `sync-status` names the missing columns; the clinic itself keeps working.

## Starting over on the mini-PC

Setup never copies over a database that already has patients. To redo the copy from
Neon (for example after a trial run, before the real switch-over), delete the local
database first, then run setup again:

```
"C:\Program Files\PostgreSQL\18\bin\dropdb" -U postgres opd
```
