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
   value=round(255*.965) if L>.45 else round(sum(c)/3)
   result.append((value,value,value));continue
  h,s,v=colorsys.rgb_to_hsv(*(x/255 for x in c))
  # Logo samples: saturated bright pixels median S=.973, V=.988.
  # Fix each role's S/V; rotate only H. No palette-wide chroma compression.
  saturation=.90+.08*s
  value=.94+.05*v
  result.append(tuple(round(255*x) for x in colorsys.hsv_to_rgb((h+brand/360)%1,saturation,value)))
 return result,brand%360
