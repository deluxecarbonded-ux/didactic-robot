#!/usr/bin/env python3
"""Populate generated locale packs from the repository's local phrasebook.

The generator intentionally creates complete English fallback catalogs first.
No network or external service is used. Unsupported phrases intentionally keep
their English fallback until a local phrase is added to PHRASES.
"""
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ROOT / "assets" / "locales"

# Phrasebook is intentionally source-keyed. Add phrases here as product copy
# evolves; the script keeps all other extracted UI strings on English fallback.
PHRASES = {
    "Home": {"es": "Inicio", "fr": "Accueil", "de": "Startseite", "it": "Home", "pt": "Início", "ru": "Главная", "ar": "الرئيسية", "hi": "होम", "zh": "首页", "ja": "ホーム", "ko": "홈", "tr": "Ana Sayfa"},
    "Play": {"es": "Jugar", "fr": "Jouer", "de": "Spielen", "it": "Gioca", "pt": "Jogar", "ru": "Играть", "ar": "تشغيل", "hi": "खेलें", "zh": "开始游戏", "ja": "プレイ", "ko": "플레이", "tr": "Oyna"},
    "Multi": {"es": "Multijugador", "fr": "Multijoueur", "de": "Mehrspieler", "it": "Multigiocatore", "pt": "Multijogador", "ru": "Мультиплеер", "ar": "متعدد اللاعبين", "hi": "मल्टीप्लेयर", "zh": "多人游戏", "ja": "マルチ", "ko": "멀티플레이", "tr": "Çok Oyunculu"},
    "Shop": {"es": "Tienda", "fr": "Boutique", "de": "Shop", "it": "Negozio", "pt": "Loja", "ru": "Магазин", "ar": "المتجر", "hi": "दुकान", "zh": "商店", "ja": "ショップ", "ko": "상점", "tr": "Mağaza"},
    "Profile": {"es": "Perfil", "fr": "Profil", "de": "Profil", "it": "Profilo", "pt": "Perfil", "ru": "Профиль", "ar": "الملف الشخصي", "hi": "प्रोफ़ाइल", "zh": "个人资料", "ja": "プロフィール", "ko": "프로필", "tr": "Profil"},
    "Rankings": {"es": "Clasificación", "fr": "Classement", "de": "Rangliste", "it": "Classifica", "pt": "Classificação", "ru": "Рейтинг", "ar": "التصنيف", "hi": "रैंकिंग", "zh": "排行榜", "ja": "ランキング", "ko": "순위", "tr": "Sıralama"},
    "Settings": {"es": "Configuración", "fr": "Paramètres", "de": "Einstellungen", "it": "Impostazioni", "pt": "Configurações", "ru": "Настройки", "ar": "الإعدادات", "hi": "सेटिंग्स", "zh": "设置", "ja": "設定", "ko": "설정", "tr": "Ayarlar"},
    "How to play": {"es": "Cómo jugar", "fr": "Comment jouer", "de": "Spielanleitung", "it": "Come giocare", "pt": "Como jogar", "ru": "Как играть", "ar": "طريقة اللعب", "hi": "कैसे खेलें", "zh": "玩法", "ja": "遊び方", "ko": "게임 방법", "tr": "Nasıl oynanır"},
    "Language and direction": {"es": "Idioma y dirección", "fr": "Langue et direction", "de": "Sprache und Richtung", "it": "Lingua e direzione", "pt": "Idioma e direção", "ru": "Язык и направление", "ar": "اللغة والاتجاه", "hi": "भाषा और दिशा", "zh": "语言和方向", "ja": "言語と方向", "ko": "언어 및 방향", "tr": "Dil ve yön"},
    "Interface language": {"es": "Idioma de la interfaz", "fr": "Langue de l’interface", "de": "Oberflächensprache", "it": "Lingua dell’interfaccia", "pt": "Idioma da interface", "ru": "Язык интерфейса", "ar": "لغة الواجهة", "hi": "इंटरफ़ेस भाषा", "zh": "界面语言", "ja": "インターフェース言語", "ko": "인터페이스 언어", "tr": "Arayüz dili"},
    "Language updated.": {"es": "Idioma actualizado.", "fr": "Langue mise à jour.", "de": "Sprache aktualisiert.", "it": "Lingua aggiornata.", "pt": "Idioma atualizado.", "ru": "Язык обновлён.", "ar": "تم تحديث اللغة.", "hi": "भाषा अपडेट की गई।", "zh": "语言已更新。", "ja": "言語を更新しました。", "ko": "언어가 업데이트되었습니다.", "tr": "Dil güncellendi."}
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--locales", nargs="*", help="Locale codes; default is every generated locale")
    args = parser.parse_args()
    manifest = json.loads((LOCALES / "index.json").read_text())
    wanted = set(args.locales or [item["code"] for item in manifest["locales"]])
    for item in manifest["locales"]:
        code = item["code"]
        if code not in wanted or code == "en":
            continue
        path = LOCALES / item["file"]
        pack = json.loads(path.read_text())
        language = code.split("-")[0]
        count = 0
        for source, value in pack.get("translations", {}).items():
            translated = PHRASES.get(source, {}).get(language)
            if translated:
                pack["translations"][source] = translated
                count += 1
        path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n")
        print(f"{code}: applied {count} local translations")

if __name__ == "__main__":
    main()