# Contrast verification

Measured 13 October 2026 using sRGB relative luminance. Normal text target 4.5:1; essential borders/focus target 3:1. Pairs match application theme tokens.

| Pair                      | Foreground | Background | Ratio   | Target | Result |
| ------------------------- | ---------- | ---------- | ------- | ------ | ------ |
| Light body                | `#14233D`  | `#FFFFFF`  | 15.70:1 | 4.5:1  | PASS   |
| Light body on canvas      | `#14233D`  | `#F7F9FC`  | 14.89:1 | 4.5:1  | PASS   |
| Light secondary text      | `#647187`  | `#FFFFFF`  | 4.94:1  | 4.5:1  | PASS   |
| Light secondary on canvas | `#647187`  | `#F7F9FC`  | 4.68:1  | 4.5:1  | PASS   |
| Primary button            | `#FFFFFF`  | `#2663D8`  | 5.44:1  | 4.5:1  | PASS   |
| Dark body                 | `#EDF2FA`  | `#1B2533`  | 13.75:1 | 4.5:1  | PASS   |
| Dark secondary            | `#A5B2C6`  | `#1B2533`  | 7.20:1  | 4.5:1  | PASS   |
| Dark links                | `#A7C8FF`  | `#1B2533`  | 9.09:1  | 4.5:1  | PASS   |
| Light success             | `#247252`  | `#EDF7F1`  | 5.32:1  | 4.5:1  | PASS   |
| Light warning             | `#946016`  | `#FFF6E6`  | 4.96:1  | 4.5:1  | PASS   |
| Light critical            | `#B64242`  | `#FFF0F0`  | 4.93:1  | 4.5:1  | PASS   |
| Dark success              | `#91D6B5`  | `#1F3A31`  | 7.31:1  | 4.5:1  | PASS   |
| Dark warning              | `#E9C37D`  | `#3E3424`  | 7.30:1  | 4.5:1  | PASS   |
| Dark critical             | `#F1A1A1`  | `#432D34`  | 6.22:1  | 4.5:1  | PASS   |
| Light input border        | `#7B899C`  | `#FFFFFF`  | 3.56:1  | 3:1    | PASS   |
| Dark input border         | `#72839B`  | `#1B2533`  | 4.00:1  | 3:1    | PASS   |
| Light focus               | `#2663D8`  | `#FFFFFF`  | 5.44:1  | 3:1    | PASS   |
| Dark focus                | `#92B9FF`  | `#1B2533`  | 7.80:1  | 3:1    | PASS   |

Brass is reserved for decorative marks and large artwork on navy; it is not approved for normal text on white. Disabled controls are visually distinct and excluded from normal active-control contrast checks. This report verifies selected color pairs, not whole-application WCAG compliance.
