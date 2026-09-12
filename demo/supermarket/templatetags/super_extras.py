from django import template

register = template.Library()


@register.filter
def modulo(value, arg):
    """取模（商品占位图色相分散用）。"""
    try:
        return int(value) % int(arg)
    except (TypeError, ValueError):
        return 0


@register.filter
def get_item(d, key):
    """字典按键取值（首页分类直播角标）。"""
    if isinstance(d, dict):
        return d.get(key)
    return None
