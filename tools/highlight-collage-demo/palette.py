import math
def rgb_to_ok(c):
 r,g,b=[v/255/12.92 if v/255<=.04045 else ((v/255+.055)/1.055)**2.4 for v in c]
 l=(.4122214708*r+.5363325363*g+.0514459929*b)**(1/3)
 m=(.2119034982*r+.6806995451*g+.1073969566*b)**(1/3)
 s=(.0883024619*r+.2817188376*g+.6299787005*b)**(1/3)
 L=.2104542553*l+.793617785*m-.0040720468*s
 a=1.9779984951*l-2.428592205*m+.4505937099*s
 b=.0259040371*l+.7827717662*m-.808675766*s
 return L,math.hypot(a,b),math.atan2(b,a)
def ok_to_linear(L,C,h):
 a=C*math.cos(h);b=C*math.sin(h)
 l=(L+.3963377774*a+.2158037573*b)**3;m=(L-.1055613458*a-.0638541728*b)**3;s=(L-.0894841775*a-1.291485548*b)**3
 return (4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s)
def rotate_palette(p,angle):
 vals=[rgb_to_ok(c) for c in p];angle=math.radians(angle)
 # Common chroma scaling keeps relative hue and chroma proportions.
 factor=1.
 while True:
  linear=[ok_to_linear(L,C*factor,h+angle) for L,C,h in vals]
  if all(-1e-6<=v<=1.000001 for c in linear for v in c) or factor<.001:break
  factor*=.98
 def encode(v):return int(round(255*(12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055)))
 return [tuple(max(0,min(255,encode(v))) for v in c) for c in linear]


# Bright members of the series palette, from SERIES_GUIDE 5.2f.
BRAND_BRIGHT=['#ffe29a','#ffa866','#7ee03a','#4cc86a','#3cc4b8','#6bb2ea','#8d74ec','#c475e3','#e36dd0','#ff9fc0','#f2536a']
def bright_palette(p,brand):
 import colorsys
 result=[]
 for c in p:
  L,C,_=rgb_to_ok(c)
  if C<.045:
   result.append(tuple(c));continue
  h,s,v=colorsys.rgb_to_hsv(*(x/255 for x in c))
  # Shared monotonic brightening preserves S/V ordering and leaves soft roles soft.
  # Exact S/V distances and perceptual contrast are not claimed to be preserved.
  saturation=s**.6
  value=v**.4
  result.append(tuple(round(255*x) for x in colorsys.hsv_to_rgb((h+brand/360)%1,saturation,value)))
 return result,brand%360

# Reference design primary colors, explicitly chosen from each layout's own paints.
# None means a monochrome design: a single independent vivid Hook color is allowed.
BASE_ROLES = {
 '3870':'#e8a1bb','3871':None,'3872':'#96383d','3873':None,
 '3877':'#38866a','3878':None,'3879':'#dbc340',
 '3880':'#e9262c','3881':'#d18c77','3882':'#ce711c',
 '3883':'#ec4051','3884':'#78bfd4','3885':None,'3886':'#eddb46',
 '3887':'#bc4d59','3888':'#299bc4','3889':'#fc7b18',
 '3890':'#b85c47','3891':None,'3892':'#24aeb7','3893':'#4db1c4',
 '3894':'#b44b58','3895':'#2496c2','3896':'#e1cc3b',
 '3897':None,'3898':None,'3899':'#e9222a',
 '3900':'#5264b3','3901':'#d68d43','3902':None,'3903':'#e9222a',
 '3904':'#368bc0','3905':'#e9222a','3907':'#dbc340','3908':'#ce711c'
}
def hook_base(ident,mapping,angle):
 import colorsys
 source=BASE_ROLES[ident]
 if source is not None:return mapping[source]
 return '#%02x%02x%02x'%tuple(round(v*255) for v in colorsys.hsv_to_rgb((angle/360)%1,.9,.98))
