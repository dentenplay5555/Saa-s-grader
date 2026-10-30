# Deploy: 2 สถานที่ (Fedora + Manjaro)

> สถานะ: ไฟล์ compose/Dockerfile ผ่านการตรวจ syntax (`docker compose config`) และคำสั่ง set-password / backup ทดสอบกับ DB จริงแล้ว
> **ยังไม่เคยรัน Judge0 บนเครื่องจริงของคุณ** ให้รัน `deploy/judge0/smoke-test.sh` ก่อนเปิดให้นักเรียนใช้ทุกครั้ง

## 1. ผังระบบ (สมมติ: Fedora = app, Manjaro = judge — สลับกันได้)

```
นักเรียน ──HTTPS──> Cloudflare Tunnel ──> [สถานที่ A: Fedora]
                                           Docker: app (Express + SQLite + worker)
                                                      │  Tailscale (VPN ส่วนตัว)
                                                      ▼
                                          [สถานที่ B: Manjaro]
                                           VM Ubuntu (cgroup v1)
                                             Docker: Judge0 (server + worker + postgres + redis)
```

เหตุผล: ข้อมูลสำคัญ (DB นักเรียน) อยู่เครื่องเดียว ส่วน judge ไม่เก็บอะไรถาวร ถ้าพังก็แค่ตรวจไม่ได้ชั่วคราว (งานจะ retry) และโค้ดนักเรียนที่ไม่น่าไว้ใจไปรันอยู่ใน VM ห่างจาก DB
ถ้ามีเครื่องเดียวต่อสถานที่และอยากให้ทั้งสองที่ทำงานเต็มชุด ให้ทำทั้งขั้น 3 และ 4 บนแต่ละเครื่อง

## 2. ข้อจำกัดที่ต้องรู้ก่อน (สำคัญที่สุด)

- Judge0 1.13.x **ยังไม่รองรับ cgroup v2 อย่างเป็นทางการ** ([issue #543](https://github.com/judge0/judge0/issues/543): วิธีแก้ที่คนใช้คือบังคับกลับเป็น cgroup v1 แต่บางคนรายงานว่าไม่ได้ผล)
- **systemd 258 ขึ้นไปตัด cgroup v1 ทิ้งแล้ว** ([ข่าว](https://linuxiac.com/systemd-258-drops-cgroup-v1-raises-kernel-baseline-to-5-4/)) แปลว่า Fedora/Manjaro รุ่นใหม่ๆ ที่มี systemd 258+ จะใช้ kernel parameter `systemd.unified_cgroup_hierarchy=0` ไม่ได้
- เช็คที่เครื่องคุณ: `systemctl --version | head -1` ถ้า ≥ 258 ให้ถือว่ารัน Judge0 บนเครื่องจริงตรงๆ ไม่ได้
- **ทางออกในคู่มือนี้:** รัน Judge0 ใน VM ที่ใช้ Ubuntu รุ่นเก่า (kernel เป็นของ VM เอง เลยไม่ขึ้นกับ systemd ของเครื่อง host)

## 3. สถานที่ B — เครื่อง judge (VM + Judge0)

### 3.1 ติดตั้ง virtualization บนเครื่อง host
**Manjaro**
```bash
sudo pacman -S --needed qemu-full virt-manager libvirt dnsmasq edk2-ovmf
sudo systemctl enable --now libvirtd
sudo usermod -aG libvirt $USER      # แล้ว logout/login
```
**Fedora**
```bash
sudo dnf install @virtualization
sudo systemctl enable --now libvirtd
sudo usermod -aG libvirt $USER      # แล้ว logout/login
```
เปิด `virt-manager` สร้าง VM: 2 vCPU, 4 GB RAM, ดิสก์ 20 GB, เครือข่าย NAT (ค่าเริ่มต้น)

### 3.2 ติดตั้ง Ubuntu Server ใน VM
- แนะนำ **Ubuntu 20.04 LTS** (ใช้ cgroup v1 เป็นค่าเริ่มต้น ไม่ต้องตั้งอะไร และเป็นรุ่นที่มีคนรายงานว่า Judge0 ทำงานได้) ถ้าโหลดไม่ได้แล้วใช้ 22.04 ต้องเพิ่มข้อ 3.3 และอาจยังไม่สำเร็จ
- 20.04 หมดช่วง support มาตรฐานแล้ว ให้ใช้ VM นี้เฉพาะงาน judge, เปิดให้เข้าได้ผ่าน Tailscale เท่านั้น และอัปเดตแพ็กเกจเท่าที่ยังมี (หรือเปิด Ubuntu Pro ESM แบบส่วนตัว)

### 3.3 ตรวจ cgroup ใน VM
```bash
stat -fc %T /sys/fs/cgroup/
```
- ได้ `tmpfs` = cgroup v1 ผ่านแล้ว
- ได้ `cgroup2fs` (เช่น Ubuntu 22.04): แก้ `/etc/default/grub` ให้ `GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"` แล้ว `sudo update-grub && sudo reboot` จากนั้นตรวจใหม่

### 3.4 ลง Docker + รัน Judge0 ใน VM
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/dentenplay5555/saa-s-grader && cd saa-s-grader/deploy/judge0
cp judge0.conf.example judge0.conf
# แทนที่ CHANGE_ME ทุกจุดด้วยค่าสุ่ม:  openssl rand -hex 24
nano judge0.conf
docker compose up -d
```
รอ ~1 นาทีแล้วทดสอบ:
```bash
JUDGE0_AUTH_TOKEN=<AUTHN_TOKEN ที่ตั้ง> ./smoke-test.sh
```
ต้องได้ `PASS` ครบ 4 บรรทัด (ตรวจถูก, ตรวจผิด, วนลูปไม่รู้จบ → TLE, compile error → CE)
ถ้า `no token` ให้ดู token/URL, ถ้า TLE/ทุกอย่างพัง ให้ดู `docker compose logs worker` (อาการ `/box/...` หาไม่เจอ = cgroup ยังไม่ใช่ v1)
**ถ้าไม่ผ่านอย่าเปิดใช้งานจริง**

### 3.5 Tailscale + firewall ใน VM
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4            # จดไว้ใช้เป็น JUDGE0_URL เช่น 100.64.1.2
sudo ufw allow in on tailscale0 to any port 2358 proto tcp
sudo ufw allow OpenSSH && sudo ufw enable
```
อย่าเปิดพอร์ต 2358 ให้อินเทอร์เน็ตสาธารณะ

## 4. สถานที่ A — เครื่อง app (Fedora)

### 4.1 Docker
```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker && sudo usermod -aG docker $USER
```
ถ้า repo ของ Docker ยังไม่รองรับ Fedora รุ่นล่าสุด ให้ใช้ `podman` + `podman compose` แทนได้ (compose ของ app ไม่ใช้ privileged) ผมยังไม่ได้ทดสอบทางนี้

### 4.2 รัน app
```bash
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
git clone https://github.com/dentenplay5555/saa-s-grader && cd saa-s-grader/deploy/app
cp env.example .env
# ตั้ง AUTH_SECRET=$(openssl rand -hex 32), JUDGE0_URL=http://<tailscale ip ของ VM>:2358,
# JUDGE0_AUTH_TOKEN (ตรงกับ AUTHN_TOKEN), SEED_*_PASSWORD
nano .env
docker compose up -d --build
curl -s localhost:3000/api/problems | head -c 200     # ต้องเห็น a-plus-b
```
เปลี่ยน/ตั้งรหัสผ่านภายหลัง:
```bash
docker compose exec app node dist/server/cli/setPassword.js user@example.com 'รหัสผ่านใหม่ยาวๆ'
```
หลัง start ครั้งแรกให้ลบ `SEED_*_PASSWORD` ออกจาก `.env` (ใช้เฉพาะตอน DB ว่าง)

### 4.3 เปิดให้นักเรียนเข้า (เลือกอย่างใดอย่างหนึ่ง)
- **Cloudflare Tunnel** (ต้องมีโดเมนที่ใช้ DNS ของ Cloudflare): สร้าง tunnel ใน Cloudflare Zero Trust ชี้ไป `http://localhost:3000` แล้วติดตั้ง `cloudflared` ตามคำสั่งที่หน้าเว็บให้ ไม่ต้องเปิดพอร์ตที่ router
- **Tailscale Funnel**: ไม่ต้องมีโดเมน แต่ URL จะเป็น `*.ts.net` และมีข้อจำกัดของ Tailscale (ตรวจเงื่อนไขล่าสุดก่อนใช้)

ตั้ง `NODE_ENV=production` (compose ตั้งให้แล้ว) เพื่อให้ cookie เป็น `Secure`

## 5. สำรองข้อมูล (ทำทันที)
```bash
cd deploy/app
docker compose exec app node -e "require('better-sqlite3')('/data/data.db').backup('/data/backup.db').then(()=>console.log('ok'))"
docker compose cp app:/data/backup.db ./backup-$(date +%F).db
```
ตั้ง cron ให้ทำทุกวันแล้วส่งไฟล์ไปที่อื่น (Cloudflare R2, Google Drive, หรือแฟลชไดรฟ์) อย่าเก็บสำรองไว้เครื่องเดียวกับ DB

## 6. เช็คลิสต์ก่อนเปิดใช้จริง
- [ ] `smoke-test.sh` ผ่านครบ 4 ข้อบน VM จริง
- [ ] ส่งโจทย์ `a-plus-b` จากหน้าเว็บด้วยโค้ดถูก → AC, โค้ดผิด → WA
- [ ] ปิด Judge0 VM แล้วส่งงาน → ต้องเป็น `JUDGE_ERROR` (ไม่ใช่ AC) แล้วเปิดคืนแล้ว rejudge ได้
- [ ] `AUTH_SECRET`, `AUTHN_TOKEN`, รหัสผ่านทุกตัวไม่ใช่ค่าตัวอย่าง และ `.env`/`judge0.conf` ไม่ถูก commit
- [ ] พอร์ต 2358 ไม่เปิดสู่อินเทอร์เน็ต, app ไม่มี inbound port (ใช้ tunnel)
- [ ] มีไฟล์สำรอง DB อย่างน้อย 1 ชุดนอกเครื่อง
- [ ] ตั้ง uptime monitor (เช่น UptimeRobot) ที่ URL ของ app

## 7. ถ้ารัน Judge0 ในเครื่องที่มีไม่สำเร็จ
1. ทดลองใช้ Judge0 บน RapidAPI ก่อน (ตั้ง `JUDGE0_API_KEY` แทน `JUDGE0_URL`) เช็กโควตาก่อน เพราะ 1 test = 1 submission + การ poll
2. เช่า VPS Linux ที่ใช้ Ubuntu 20.04/22.04 แล้วรันขั้น 3.4–3.5 ที่นั่น ไม่ต้องใช้ VM ซ้อน
3. ใช้ sandbox ตัวอื่นที่รองรับ cgroup v2 (เช่น isolate 2.x โดยตรง) ต้องเขียน adapter ใหม่

## 8. ข้อควรรู้เรื่อง Judge0 ที่ตั้งไว้
- Judge0 CE ใช้ GCC 9.2 สำหรับ C/C++ (language id 50/54) ซึ่งรองรับ C++17 แต่ไม่ใช่เวอร์ชันที่ seed เขียนไว้ใน DB (`g++ 16.2`) ข้อความนั้นเป็นแค่ป้ายแสดงผล
- `MAX_MEMORY_LIMIT=512000` ใน `judge0.conf` จำเป็น ไม่งั้นโจทย์ที่ตั้ง memory 256 MB จะถูกปฏิเสธ
- งานที่ค้างระหว่างที่ app restart จะส่ง test ใหม่ทั้งหมด (สถานะเก็บใน memory)
