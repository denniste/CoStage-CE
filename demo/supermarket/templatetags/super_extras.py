from django import template

register = template.Library()


@register.filter
def modulo(value, arg):
    """取模（商品占位图色相分散用）。"""
    try:
        return int(value) % int(arg)
    except (TypeError, ValueError):
        return 0
