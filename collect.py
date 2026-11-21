"""Collect official venue calendars. Only replace a venue after a complete parse."""
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta
from html import unescape
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from dateutil.parser import parse
from lxml import html

PORTLAND = ZoneInfo("America/Los_Angeles")
SITES = {
    "mississippi-studios": "https://mississippistudios.com/",
    "polaris-hall": "https://polarishall.com/",
    "revolution-hall": "https://www.revolutionhall.com/",
    "crystal-ballroom": "https://www.crystalballroompdx.com/wp-json/tribe/events/v1/events?per_page=50",
    "synth-library-portland": "https://www.synthlibraryportland.org/events",
    "age-of-reflections": "https://ageofreflections.com/Calendar",
    "wonder-ballroom": "https://wonderballroom.com/events/",
}


def fetch(url):
    req = Request(url, headers={"User-Agent": "PortlandLive/1.0 concert calendar"})
    with urlopen(req, timeout=35) as response:
        return response.read().decode("utf-8")


def nodes(node, cls):
    return node.find_class(cls)


def value(node, xpath):
    return " ".join(str(node.xpath("string(" + xpath + ")")).split())


def show_time(raw):
    match = re.search(r'(?:show\s*:?\s*|^)(\d{1,2}(?::\d{2})?\s*[ap]m)', raw, re.I)
    return parse(match[1]).strftime("%H:%M") if match else ""


def reflection_rows(doc, url):
    cards = doc.xpath('//div[@grid-col][h2 and .//a[@href]]')
    if not cards:
        raise ValueError("Unrecognized Reflections calendar")
    for card in cards:
        title = value(card, './h2')
        for link in card.xpath('.//a[@href]'):
            if link.text_content().strip().upper() != "PORTLAND":
                continue
            # Each city link introduces its own date, room and optional support.
            details = []
            for node in link.itersiblings():
                if node.tail:
                    details.append(node.tail)
            if link.tail:
                details.insert(0, link.tail)
            city = link.getparent() if link.getparent().tag == "b" else link
            if city.tail:
                details.append(city.tail)
            for node in city.itersiblings():
                if node.tag == "a" or node.xpath('.//a'):
                    break
                details.extend((node.text_content(), node.tail or ""))
            fields = [field.strip() for field in details if field.strip()]
            date = parse(fields[0]).date()
            summary = " ".join(fields[2:]) if len(fields) > 2 else ""
            yield title, date, "", urljoin(url, link.get("href")), fields[1], summary


def rows(venue, today):
    url = SITES[venue]
    visited = set()
    wonder_pages = set()
    while url:
        if url in visited or urlsplit(url).hostname != urlsplit(SITES[venue]).hostname:
            raise ValueError("Unexpected calendar pagination")
        visited.add(url)
        raw = fetch(url)
        url = None
        if venue == "crystal-ballroom":
            page = json.loads(raw)
            for event in page["events"]:
                start = datetime.fromisoformat(event["start_date"])
                yield unescape(event["title"]), start.date(), start.strftime("%H:%M"), event["url"]
            url = page.get("next_rest_url")
            continue
        doc = html.fromstring(json.loads(raw) if raw.lstrip().startswith(chr(34)) else raw)
        if venue == "age-of-reflections":
            yield from reflection_rows(doc, SITES[venue])
        elif venue == "synth-library-portland":
            cards = nodes(doc, "eventlist-event")
            if not cards:
                raise ValueError("Unrecognized Synth Library calendar")
            for card in cards:
                link = nodes(card, "eventlist-title-link")[0]
                calendar = card.xpath('.//a[contains(@href,"calendar/event") and contains(@href,"dates=")]/@href')[0]
                params = parse_qs(urlsplit(calendar).query)
                stamp = params["dates"][0].split("/")[0]
                start = datetime.fromisoformat(stamp)
                if start.tzinfo:
                    start = start.astimezone(PORTLAND)
                location = params.get("location", [""])[0]
                if location and not re.search(r"\bPortland\b", location, re.I):
                    continue
                paragraphs = [" ".join(p.text_content().split()) for p in card.xpath(".//p")]
                summary = next((p for p in paragraphs if len(p) >= 40), "")
                if len(summary) > 220:
                    summary = summary[:217].rsplit(" ", 1)[0] + "…"
                yield (link.text_content(), start.date(), start.strftime("%H:%M") if "T" in stamp else "",
                       urljoin(SITES[venue], link.get("href")), location, summary)
        elif venue == "wonder-ballroom":
            cards = nodes(doc, "eventWrapper")
            signature = tuple(value(card,'.//a[@id="eventTitle"]/@href') for card in cards)
            if signature in wonder_pages:
                break
            wonder_pages.add(signature)
            if not cards and len(visited)>1:
                break
            for card in cards:
                link = card.xpath('.//a[@id="eventTitle"]')[0]
                if "/wonder-ballroom/" in link.get("href"):
                    yield link.text_content().strip(), parse(value(card,'.//*[@id="eventDate"]')).date(), show_time(value(card,'.//*[contains(@class,"eventDoorStartDate")]')), link.get("href")
            url = value(doc,'//link[@rel="next"]/@href')
        elif venue == "polaris-hall":
            for card in nodes(doc, "event"):
                label = nodes(card,"event__date")[0].text_content().strip()
                # The venue prints weekday and month/day. Match both across New Year.
                for year in range(today.year-1,today.year+3):
                    date = parse(f"{label} {year}").date()
                    if date.strftime("%A") == label.split(",")[0] and date >= today-timedelta(days=90):
                        break
                else:
                    raise ValueError(f"Unresolved date {label}")
                yield nodes(card,"event__title")[0].text_content(), date, show_time(value(card,'.//*[contains(@class,"event__time--show")]/*[last()]')), nodes(card,"event__action")[0].get("href")
        else:
            room = "16896" if venue == "mississippi-studios" else "16897"
            for card in doc.xpath('//*[@data-venue-id=$id][.//*[@data-event-doors]]',id=room):
                link = card.xpath('.//*[self::h2 or self::h3]/a')[0]
                doors = card.xpath('.//*[@data-event-doors]')[0]
                stamp = doors.get("data-event-doors")
                if stamp:
                    date = parse(stamp).astimezone(PORTLAND).date()
                else:
                    label = value(card,'.//*[@class="event-date--full"]')
                    date = parse(label, default=datetime(today.year,1,1)).date()
                yield link.text_content(), date, show_time(doors.text_content()), link.get("href")
            if venue == "revolution-hall":
                page = len(visited) + 1
                if doc.xpath('//a[@data-pagination-page=$p]',p=str(page)):
                    url = f"{SITES[venue]}wp-json/wlcr/v1/events/all/page/{page}?style=default&page_id=6"
            if venue == "mississippi-studios":
                for card in nodes(doc,"weekday-event"):
                    if value(card,'.//*[@class="event-venue"]') != "Mississippi Studios":
                        continue
                    month = value(card,'ancestor::*[@data-month-handle][1]/@data-month-handle')
                    day = value(card,'../*[@class="day-header"]').split("/")[-1]
                    date = datetime.strptime(month + day.zfill(2),"%Y%m%d").date()
                    link = nodes(card,"event-title")[0].xpath('.//a')[0]
                    yield link.text_content(), date, "", link.get("href")


def collect(venue, today):
    result = {}
    for title, date, time, url, *location in rows(venue,today):
        artist = " ".join(title.split())
        if not artist or urlsplit(url).scheme not in ("http","https") or not urlsplit(url).hostname:
            raise ValueError("Incomplete event")
        if date < today:
            continue
        etix = re.search(r'etix\.com/ticket/p/(\d+)',url)
        key = etix[1] if etix else urlsplit(url).path.rstrip("/")
        uid = "auto-" + hashlib.sha256(f"{venue}|{key}|{date}".encode()).hexdigest()[:24]
        if uid not in result or time:
            result[uid] = dict(id=uid, artist=artist,date=date.isoformat(),time=time,venueId=venue,ticketUrl=url,source=venue)
            if location and location[0]:
                result[uid]["location"] = location[0]
            if len(location) > 1 and location[1]:
                result[uid]["summary"] = location[1]
    if not result and venue not in ("synth-library-portland", "age-of-reflections"):
        raise ValueError("No validated upcoming shows")
    return list(result.values())


def main():
    path = Path("shows.json")
    old = json.loads(path.read_text())
    today = datetime.now(PORTLAND).date()
    manual = [r for r in old if r.get("source") not in SITES]
    records = list(manual)
    failures = []
    for venue in SITES:
        try:
            batch = collect(venue,today)
            print(venue,len(batch),flush=True)
        except Exception as exc:
            failures.append(venue)
            print(f"::warning::{venue}: {exc}. Keeping published records.",flush=True)
            batch = [r for r in old if r.get("source")==venue]
        for item in batch:
            if not any(m["id"]==item["id"] or (m["venueId"]==venue and m["date"]==item["date"] and m.get("artist","").casefold()==item["artist"].casefold() and (not m.get("time") or m["time"]==item["time"])) for m in manual):
                records.append(item)
    records.sort(key=lambda r:(r["date"],r["venueId"],r.get("time",""),r["id"]))
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(records,ensure_ascii=False,indent=2)+"\n")
    temp.replace(path)
    return bool(failures)


if __name__ == "__main__":
    sys.exit(main())
