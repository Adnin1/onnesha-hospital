import urllib.request
import uuid
import sys
import os

def send_to_telegram(file_path, caption_text):
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN')
    if not bot_token:
        print("Error: TELEGRAM_BOT_TOKEN environment variable not set.")
        return False
    chat_id = os.environ.get('TELEGRAM_CHAT_ID', '1161469999')

    boundary = uuid.uuid4().hex
    headers = {'Content-Type': f'multipart/form-data; boundary={boundary}'}

    data = []
    def add_field(name, value):
        data.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode('utf-8'))

    add_field('chat_id', chat_id)
    add_field('caption', caption_text)

    with open(file_path, 'rb') as f:
        file_bytes = f.read()

    filename = file_path.split('\\')[-1]
    data.append(f'--{boundary}\r\nContent-Disposition: form-data; name="document"; filename="{filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n'.encode('utf-8'))
    data.append(file_bytes)
    data.append(f'\r\n--{boundary}--\r\n'.encode('utf-8'))

    body = b''.join(data)
    req = urllib.request.Request(f'https://api.telegram.org/bot{bot_token}/sendDocument', data=body, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            print('Telegram Status:', resp.status)
            return True
    except Exception as e:
        print('Telegram send error:', e)
        return False

if __name__ == '__main__':
    pptx_path = r'C:\Users\mahin khan\Desktop\ONNESHA_HOSPITAL_RECEPTION_BABY_STEP_GUIDE.pptx'
    caption = (
        "🏥 অন্বেষা হাসপাতাল (OHMS) — রিসেপশন মাস্টার অপারেটিং গাইড (.PPTX)\n\n"
        "✨ একটি ছোট বাচ্চার মতো সহজ ধাপে সম্পূর্ণ রিসেপশন, রোগী নিবন্ধন, ডাক্তার বুকিং, "
        "৮০ মিমি থার্মাল প্রিন্ট, ক্যাশ/বিকাশ বিলিং এবং শিফট ক্লোজিংয়ের সম্পূর্ণ নির্দেশিকা।\n\n"
        "💻 লাইভ সিস্টেম: https://onnesha-hospital.pages.dev"
    )
    send_to_telegram(pptx_path, caption)
