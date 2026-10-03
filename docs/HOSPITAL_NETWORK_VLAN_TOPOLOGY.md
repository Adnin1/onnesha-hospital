# Onnesha Hospital Management System (OHMS)
## Hospital Network VLAN Architecture & Medical Device Isolation Specification (Gate 14)

### 1. Executive Summary & Compliance
In accordance with **DGHS (Directorate General of Health Services Bangladesh)**, **ISO 27799** (Health Informatics Security), and **IEC 80001-1** (Risk Management for IT-networks incorporating medical devices), the hospital's local area network (LAN) must enforce strict Layer 2/3 traffic isolation. 

Medical instruments, LIS analyzers, thermal receipt printers, and public TV displays must never share a flat broadcast domain with untrusted devices or guest Wi-Fi.

---

### 2. IEEE 802.1Q VLAN Segmentation Matrix

| VLAN ID | Subnet CIDR | Network Name | Device Types & Functions | Security Zone | Inbound Internet |
| :---: | :---: | :--- | :--- | :---: | :---: |
| **VLAN 10** | `10.10.10.0/24` | **Clinical & Reception** | Doctor Consultation PCs, Reception Desks, Cashier POS, Pharmacy Terminals | Trusted Clinical | Outbound HTTPS Only |
| **VLAN 20** | `10.10.20.0/24` | **Biomedical & LIS Analyzers** | Mindray BC-5000, Sysmex XN-350, Roche Cobas c311, Blood Gas, Local LIS Bridge PC | Air-Gapped Biomedical | **STRICTLY BLOCKED (Zero Internet)** |
| **VLAN 30** | `10.10.30.0/24` | **Peripherals & Displays** | ESC/POS 80mm Network Printers (Port 9100), Android/HDMI TV Lobby Displays, Digital Signage | Restricted Peripheral | Filtered NTP/HTTPS |
| **VLAN 40** | `172.16.0.0/22` | **Patient & Guest Wi-Fi** | Patient Smartphones, Visitor Laptops, Public Lobby Wi-Fi APs | Untrusted Public | Internet Only (Isolated) |
| **VLAN 50** | `10.10.50.0/24` | **Management & Infrastructure** | Core Managed Switches, Router Management, NVR CCTV Cameras, UPS SNMP | Management Core | Restricted VPN / Admin SSH |

---

### 3. Static IP Reservation & Port Assignment Table

#### VLAN 20: Laboratory Analyzers & LIS Bridge
- `10.10.20.1` — Gateway / Router Interface (VLAN 20)
- `10.10.20.10` — **OHMS Local LIS Bridge Workstation** (Listens on TCP `5100`, RS-232 bridge)
- `10.10.20.21` — Mindray BC-5000 5-Part Auto Hematology Analyzer (TCP `5100` Client)
- `10.10.20.22` — Sysmex XN-350 Automated Hematology System (Serial COM / TCP)
- `10.10.20.23` — Roche Cobas c311 Clinical Chemistry Analyzer (HL7 v2.5.1 TCP)
- `10.10.20.24` — Bio-Rad D-10 HbA1c Analyzer (ASTM TCP)

#### VLAN 30: Peripherals, Printers & Kiosks
- `10.10.30.1` — Gateway / Router Interface (VLAN 30)
- `10.10.30.11` — OPD Reception Desk 1 Thermal Printer (RAW TCP `9100`)
- `10.10.30.12` — OPD Reception Desk 2 Thermal Printer (RAW TCP `9100`)
- `10.10.30.13` — Cashier & Billing Counter Thermal Printer (RAW TCP `9100`)
- `10.10.30.14` — Central Pharmacy Dispense Label Printer (RAW TCP `9100`)
- `10.10.30.15` — Laboratory Specimen Barcode Label Printer (RAW TCP `9100`)
- `10.10.30.51` — Main Lobby OPD Queue Calling Display (Android TV / HDMI Kiosk)
- `10.10.30.52` — Emergency Casualty Triage Display (HDMI Wall Display)

---

### 4. Router & Switch Access Control Lists (ACL Rules)

#### Rule 1: Biomedical & Analyzer Isolation (VLAN 20)
```text
deny ip 10.10.20.0 0.0.0.255 any (Drop all outbound Internet WAN traffic)
permit tcp 10.10.20.0 0.0.0.255 host 10.10.20.10 eq 5100 (Allow analyzers to forward ASTM/HL7 to Local LIS Bridge)
permit tcp host 10.10.20.10 any eq 443 (Allow Local LIS Bridge PC outbound HTTPS to OHMS Cloud)
deny ip 10.10.20.0 0.0.0.255 10.10.10.0 0.0.0.255 (Prevent analyzers from probing staff PCs)
```

#### Rule 2: Peripheral & Printer Subnet (VLAN 30)
```text
permit tcp 10.10.10.0 0.0.0.255 10.10.30.0 0.0.0.255 eq 9100 (Allow staff workstations to send raw print jobs)
permit tcp 10.10.30.50 0.0.0.15 any eq 443 (Allow Android TV displays HTTPS to /displays/*)
deny ip 10.10.30.0 0.0.0.255 10.10.10.0 0.0.0.255 (Prevent printers from accessing clinical PCs)
```

#### Rule 3: Patient & Guest Wi-Fi (VLAN 40)
```text
deny ip 172.16.0.0 0.0.3.255 10.0.0.0 0.255.255.255 (Strict drop to all internal hospital subnets)
permit ip 172.16.0.0 0.0.3.255 any (Allow outbound Internet for patients)
```

---

### 5. Hardware Switch Setup Guide (MikroTik / Cisco / TP-Link Omada)

#### MikroTik RouterOS Configuration Template:
```routeros
# 1. Create VLAN Interfaces on Bridge
/interface vlan
add interface=bridge1 name=VLAN10_CLINICAL vlan-id=10
add interface=bridge1 name=VLAN20_LIS vlan-id=20
add interface=bridge1 name=VLAN30_PERIPHERALS vlan-id=30
add interface=bridge1 name=VLAN40_GUEST vlan-id=40

# 2. Assign IP Addresses
/ip address
add address=10.10.10.1/24 interface=VLAN10_CLINICAL
add address=10.10.20.1/24 interface=VLAN20_LIS
add address=10.10.30.1/24 interface=VLAN30_PERIPHERALS
add address=172.16.0.1/22 interface=VLAN40_GUEST

# 3. Firewall Filter Rules (Drop guest & isolate LIS)
/ip firewall filter
add chain=forward src-address=172.16.0.0/22 dst-address=10.0.0.0/8 action=drop comment="Drop Guest to Internal"
add chain=forward src-address=10.10.20.0/24 out-interface-list=WAN action=drop comment="Air-gap LIS Analyzers from WAN"
add chain=forward src-address=10.10.10.0/24 dst-address=10.10.30.0/24 dst-port=9100 protocol=tcp action=accept comment="Allow POS Printing"
```

---

### 6. Emergency Recovery & Offline Fallback
- If local network switch fails, thermal printers connected via **WebUSB** or **WebSerial** continue printing directly from USB ports with zero dependency on the network switch.
- If cloud WAN drops, LIS analyzers buffer up to **5,000 observations** in their internal NVRAM and re-transmit automatically upon connection restore.
