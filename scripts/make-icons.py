"""生成两套图标。

素材（在 assets/brand/ 下，AI 原创，与模型文件无关）：
  · lumi-icon.jpg  项目品牌图 —— 用在控制台侧栏的头像位

为什么分两套：系统层（任务栏、标题栏、托盘）保持角色形象，用户一眼能把
"这是哪个桌宠"和窗口对应起来；侧栏是项目自己的品牌位，用项目图更合适。

为什么必须裁：托盘图标只有 32×32，整张立绘缩下去只剩一团白，裁过才认得出。
裁剪框按相对比例标注，换素材只调 CX / CY / BOX。
"""
from PIL import Image, ImageDraw
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BRAND = ROOT / "assets" / "brand"
OUT = ROOT / "public"
OUT.mkdir(exist_ok=True)


def rounded(img: Image.Image, size: int, radius_ratio: float = 0.5) -> Image.Image:
    img = img.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    d = ImageDraw.Draw(mask)
    r = int(size * 4 * radius_ratio)
    d.rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=r, fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def crop_rel(im: Image.Image, cx: float, cy: float, box: float) -> Image.Image:
    w, h = im.size
    side = int(min(w, h) * box)
    left = max(0, int(w * cx - side / 2))
    top = max(0, int(h * cy - side / 2))
    return im.crop((left, top, left + side, top + side))


# ---- 品牌图标：控制台侧栏头像 ----
brand = Image.open(BRAND / "lumi-icon.jpg").convert("RGBA")
# 头 + 肩 + 围巾都在画面里（比纯头部特写松一些，缩到 36px 也看得出是个人物）
head = crop_rel(brand, 0.50, 0.42, 0.80)
rounded(head, 256).save(OUT / "icon.png")
rounded(head, 32).save(OUT / "tray.png")
rounded(head, 64).save(OUT / "tray@2x.png")

print("icons written: app icon (model) + brand icon (lumi)")
