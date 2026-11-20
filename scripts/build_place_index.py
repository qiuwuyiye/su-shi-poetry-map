#!/usr/bin/env python3
"""Infer conservative map locations from explicit place names in poem titles."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "corpus.db"

# Keep aliases conservative: every match should be usable as evidence on its own.
# Coordinates are modern city/mountain centres, not claimed writing locations.
PLACES = [
    ("changan", "长安", "陕西西安", 34.3416, 108.9398, ["长安"]),
    ("luoyang", "洛阳", "河南洛阳", 34.6197, 112.4540, ["洛阳", "洛城"]),
    ("kaifeng", "汴京", "河南开封", 34.7973, 114.3076, ["汴京", "汴梁", "开封", "汴州"]),
    ("nanjing", "金陵", "江苏南京", 32.0603, 118.7969, ["金陵", "建康", "建业", "江宁", "石头城"]),
    ("hangzhou", "杭州", "浙江杭州", 30.2741, 120.1551, ["杭州", "临安", "钱塘", "武林"]),
    ("suzhou", "姑苏", "江苏苏州", 31.2989, 120.5853, ["姑苏", "苏州", "吴郡"]),
    ("yangzhou", "扬州", "江苏扬州", 32.3942, 119.4129, ["扬州", "广陵", "维扬"]),
    ("zhenjiang", "润州", "江苏镇江", 32.1878, 119.4250, ["润州", "镇江", "京口"]),
    ("changzhou", "常州", "江苏常州", 31.8107, 119.9741, ["常州", "毗陵"]),
    ("xuzhou", "徐州", "江苏徐州", 34.2044, 117.2858, ["徐州", "彭城"]),
    ("chuzhou", "滁州", "安徽滁州", 32.3018, 118.3162, ["滁州", "琅琊山"]),
    ("xuanzhou", "宣州", "安徽宣城", 30.9407, 118.7588, ["宣州", "宣城", "敬亭山"]),
    ("chizhou", "池州", "安徽池州", 30.6648, 117.4916, ["池州", "秋浦"]),
    ("huangshan", "黄山", "安徽黄山", 30.1335, 118.1675, ["黄山", "歙州", "新安江"]),
    ("shaoxing", "越州", "浙江绍兴", 30.0303, 120.5802, ["越州", "会稽", "绍兴", "山阴"]),
    ("ningbo", "明州", "浙江宁波", 29.8683, 121.5440, ["明州", "宁波", "四明"]),
    ("jinhua", "婺州", "浙江金华", 29.0791, 119.6474, ["婺州", "金华"]),
    ("wenzhou", "温州", "浙江温州", 27.9949, 120.6994, ["温州", "永嘉"]),
    ("taizhou_zj", "台州", "浙江台州", 28.6564, 121.4208, ["台州", "天台山"]),
    ("fuzhou", "福州", "福建福州", 26.0745, 119.2965, ["福州", "闽州"]),
    ("quanzhou", "泉州", "福建泉州", 24.8741, 118.6757, ["泉州", "刺桐"]),
    ("zhangzhou", "漳州", "福建漳州", 24.5130, 117.6471, ["漳州"]),
    ("guangzhou", "广州", "广东广州", 23.1291, 113.2644, ["广州", "番禺", "南海郡"]),
    ("huizhou", "惠州", "广东惠州", 23.1115, 114.4162, ["惠州", "惠阳"]),
    ("shaoguan", "韶州", "广东韶关", 24.8104, 113.5972, ["韶州", "韶关"]),
    ("danzhou", "儋州", "海南儋州", 19.5211, 109.5808, ["儋州", "儋耳"]),
    ("chengdu", "成都", "四川成都", 30.5728, 104.0668, ["成都", "锦城", "锦官城", "益州"]),
    ("meishan", "眉州", "四川眉山", 30.0754, 103.8485, ["眉州", "眉山"]),
    ("kuizhou", "夔州", "重庆奉节", 31.0185, 109.4630, ["夔州", "白帝城", "奉节"]),
    ("chongqing", "渝州", "重庆", 29.5630, 106.5516, ["渝州", "重庆"]),
    ("hanzhong", "汉中", "陕西汉中", 33.0676, 107.0238, ["汉中", "梁州"]),
    ("xianyang", "咸阳", "陕西咸阳", 34.3296, 108.7089, ["咸阳"]),
    ("baoji", "陈仓", "陕西宝鸡", 34.3619, 107.2373, ["陈仓", "宝鸡"]),
    ("huashan", "华山", "陕西华阴", 34.4821, 110.0842, ["华山", "太华山"]),
    ("tongguan", "潼关", "陕西潼关", 34.5445, 110.2461, ["潼关"]),
    ("taiyuan", "并州", "山西太原", 37.8706, 112.5489, ["并州", "太原", "晋阳"]),
    ("datong", "云中", "山西大同", 40.0768, 113.3001, ["云中", "大同", "平城"]),
    ("linfen", "平阳", "山西临汾", 36.0880, 111.5190, ["临汾"]),
    ("yuncheng", "河中", "山西运城", 35.0263, 111.0073, ["河中", "蒲州", "运城"]),
    ("beijing", "燕京", "北京", 39.9042, 116.4074, ["燕京", "幽州", "蓟门"]),
    ("baoding", "易州", "河北保定", 38.8739, 115.4646, ["易州", "保定"]),
    ("handan", "邯郸", "河北邯郸", 36.6256, 114.5391, ["邯郸"]),
    ("zhengding", "真定", "河北正定", 38.1464, 114.5709, ["真定", "常山"]),
    ("cangzhou", "沧州", "河北沧州", 38.3045, 116.8388, ["沧州"]),
    ("jinan", "济南", "山东济南", 36.6512, 117.1201, ["济南", "齐州", "历下"]),
    ("qingzhou", "青州", "山东青州", 36.6846, 118.4796, ["青州"]),
    ("mizhou", "密州", "山东诸城", 35.9957, 119.4101, ["密州", "诸城"]),
    ("dengzhou", "登州", "山东蓬莱", 37.8107, 120.7588, ["登州", "蓬莱"]),
    ("qufu", "曲阜", "山东曲阜", 35.5808, 116.9865, ["曲阜", "鲁郡"]),
    ("taishan", "泰山", "山东泰安", 36.2550, 117.1000, ["泰山", "岱宗", "岱岳"]),
    ("nanyang", "南阳", "河南南阳", 32.9907, 112.5283, ["南阳", "卧龙冈"]),
    ("ruzhou", "汝州", "河南汝州", 34.1672, 112.8440, ["汝州", "临汝"]),
    ("yingzhou", "颍州", "安徽阜阳", 32.8901, 115.8142, ["颍州", "颍上"]),
    ("huangzhou", "黄州", "湖北黄冈", 30.4537, 114.8724, ["黄州", "黄冈", "赤鼻矶"]),
    ("wuchang", "武昌", "湖北武汉", 30.5465, 114.3414, ["武昌", "鄂州", "江夏"]),
    ("xiangyang", "襄阳", "湖北襄阳", 32.0089, 112.1224, ["襄阳", "襄州"]),
    ("jingzhou", "荆州", "湖北荆州", 30.3348, 112.2407, ["荆州", "江陵"]),
    ("yichang", "夷陵", "湖北宜昌", 30.6919, 111.2865, ["夷陵", "宜昌"]),
    ("yueyang", "岳州", "湖南岳阳", 29.3571, 113.1292, ["岳州", "岳阳", "洞庭湖"]),
    ("changsha", "长沙", "湖南长沙", 28.2282, 112.9388, ["长沙", "潭州"]),
    ("hengyang", "衡州", "湖南衡阳", 26.8932, 112.5719, ["衡州", "衡阳", "衡山"]),
    ("yongzhou", "永州", "湖南永州", 26.4203, 111.6134, ["永州", "零陵"]),
    ("nanchang", "洪州", "江西南昌", 28.6829, 115.8582, ["洪州", "南昌", "豫章"]),
    ("jiujiang", "江州", "江西九江", 29.7051, 116.0019, ["江州", "九江", "浔阳", "庐山"]),
    ("shangrao", "饶州", "江西上饶", 28.4549, 117.9434, ["饶州", "上饶"]),
    ("ganzhou", "虔州", "江西赣州", 25.8311, 114.9350, ["虔州", "赣州"]),
    ("guilin", "桂州", "广西桂林", 25.2742, 110.2991, ["桂州", "桂林"]),
    ("wuzhou", "梧州", "广西梧州", 23.4769, 111.2791, ["梧州", "苍梧"]),
    ("lanzhou", "兰州", "甘肃兰州", 36.0611, 103.8343, ["兰州"]),
    ("wuwei", "凉州", "甘肃武威", 37.9283, 102.6378, ["凉州", "武威"]),
    ("zhangye", "甘州", "甘肃张掖", 38.9259, 100.4498, ["甘州", "张掖"]),
    ("jiuquan", "肃州", "甘肃酒泉", 39.7326, 98.4943, ["肃州", "酒泉"]),
    ("dunhuang", "敦煌", "甘肃敦煌", 40.1421, 94.6619, ["敦煌", "沙州"]),
    ("yumen", "玉门关", "甘肃敦煌", 40.3536, 93.8641, ["玉门关"]),
    ("yangguan", "阳关", "甘肃敦煌", 39.9263, 94.0597, ["阳关"]),
    ("xining", "西宁", "青海西宁", 36.6171, 101.7782, ["西宁", "鄯州"]),
    ("tianshan", "天山", "新疆天山", 43.5000, 87.0000, ["天山"]),
    ("luntai", "轮台", "新疆轮台", 41.7776, 84.2515, ["轮台"]),
]


def main() -> None:
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        DROP TABLE IF EXISTS poem_places;
        DROP TABLE IF EXISTS places;
        CREATE TABLE places (
          id TEXT PRIMARY KEY,
          historical_name TEXT NOT NULL,
          modern_name TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          aliases TEXT NOT NULL
        );
        CREATE TABLE poem_places (
          poem_id TEXT NOT NULL,
          place_id TEXT NOT NULL,
          method TEXT NOT NULL,
          confidence TEXT NOT NULL,
          evidence TEXT NOT NULL,
          PRIMARY KEY (poem_id, place_id),
          FOREIGN KEY (poem_id) REFERENCES poems(id),
          FOREIGN KEY (place_id) REFERENCES places(id)
        );
        """
    )
    db.executemany(
        "INSERT INTO places VALUES (?, ?, ?, ?, ?, ?)",
        [
            (place_id, historical, modern, lat, lng, json.dumps(aliases, ensure_ascii=False))
            for place_id, historical, modern, lat, lng, aliases in PLACES
        ],
    )

    rows = db.execute("SELECT id, title FROM poems")
    batch: list[tuple[str, str, str, str, str]] = []
    matched_poems = 0
    links = 0
    for poem_id, title in rows:
        poem_matched = False
        for place_id, historical, _modern, _lat, _lng, aliases in PLACES:
            matched_alias = next((alias for alias in aliases if alias in title), None)
            if not matched_alias:
                continue
            batch.append(
                (
                    poem_id,
                    place_id,
                    "title_explicit",
                    "high",
                    f"题目中明确出现地名“{matched_alias}”",
                )
            )
            poem_matched = True
            links += 1
        if poem_matched:
            matched_poems += 1
        if len(batch) >= 5000:
            db.executemany("INSERT OR IGNORE INTO poem_places VALUES (?, ?, ?, ?, ?)", batch)
            batch.clear()
    if batch:
        db.executemany("INSERT OR IGNORE INTO poem_places VALUES (?, ?, ?, ?, ?)", batch)

    db.executescript(
        """
        CREATE INDEX idx_poem_places_place ON poem_places(place_id, poem_id);
        CREATE INDEX idx_poem_places_poem ON poem_places(poem_id);
        """
    )
    db.execute(
        "INSERT OR REPLACE INTO meta VALUES (?, ?)",
        ("place_index", json.dumps({
            "places": len(PLACES),
            "matched_poems": matched_poems,
            "links": links,
            "method": "explicit place names in titles",
        }, ensure_ascii=False)),
    )
    db.commit()
    db.execute("PRAGMA optimize")
    db.close()
    print(
        json.dumps(
            {"places": len(PLACES), "matched_poems": matched_poems, "links": links},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
