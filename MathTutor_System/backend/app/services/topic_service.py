def normalize_topic(value: str) -> str:
    if not value or not isinstance(value, str):
        return ""
    value = value.strip().replace("\u3000", " ").replace("\uff0c", ",")
    return " ".join(value.split())


def split_topics(topic_str: str | None) -> set[str]:
    if not topic_str or not str(topic_str).strip():
        return set()

    raw = str(topic_str).strip()
    for separator in ("＋", "、", "+"):
        raw = raw.replace(separator, "+")

    topics: set[str] = set()
    for part in raw.split("+"):
        topic = normalize_topic(part)
        if topic:
            topics.add(topic)
    return topics
