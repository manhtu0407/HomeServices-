// The illustrated light-mint map the route is drawn on: parks, buildings, water, streets and trees as
// vector shapes in a 1536 x 1024 box. It is a picture, not map data: no street in it is a real street.

export const ROUTE_MAP_BACKDROP_WIDTH = 1536
export const ROUTE_MAP_BACKDROP_HEIGHT = 1024

export const ROUTE_MAP_BACKDROP = String.raw`<defs>
  <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F8FFFD"/><stop offset=".55" stop-color="#EDF9F5"/><stop offset="1" stop-color="#DAF5EC"/></linearGradient>
  <linearGradient id="river" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#B2EFFF"/><stop offset=".6" stop-color="#B4EFF7"/><stop offset="1" stop-color="#8CDFF1"/></linearGradient>
  <linearGradient id="mintRoute" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#08C69F"/><stop offset=".5" stop-color="#21D4A7"/><stop offset="1" stop-color="#09C397"/></linearGradient>
  <linearGradient id="statusFill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F6FFFD" stop-opacity=".98"/><stop offset="1" stop-color="#D7FFF3" stop-opacity=".95"/></linearGradient>
  <linearGradient id="legendFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFFFFF" stop-opacity=".97"/><stop offset="1" stop-color="#F5FFFD" stop-opacity=".94"/></linearGradient>
  <linearGradient id="goldFill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFE49C"/><stop offset=".9" stop-color="#FFB51B"/></linearGradient>
  </defs>
<rect width="1536" height="1024" fill="#FFFFFF"/>
<!-- CARD OUTLINE -->
<rect x="25" y="35" width="1486" height="960" rx="90" fill="#C6EDE3" opacity=".34"/>
<rect x="28" y="29" width="1480" height="962" rx="85" fill="#FFFFFF" stroke="#EAF7F4" stroke-width="3"/>
<g id="MapBackground">
<rect x="0" y="0" width="1536" height="1024" fill="url(#land)"/>

<g id="Parks">
<path d="M30 157 L245 119 L319 249 Q362 370 236 459 L26 498 Z" fill="#D6F5E5" opacity=".8"/>
<path d="M298 434 L450 380 L522 600 L321 666 Z" fill="#DDF5E8" opacity=".8"/>
<path d="M490 273 L670 223 L730 448 L548 513 Z" fill="#DBF5E9" opacity=".8"/>
<path d="M981 18 L1263 0 L1278 163 L1106 199 Z" fill="#DDF6E8" opacity=".8"/>
<path d="M1080 490 L1318 421 L1358 617 L1137 720 Z" fill="#D6F5E5" opacity=".8"/>
<path d="M1112 710 L1325 634 L1509 823 L1493 987 L1154 961 L1068 836 Z" fill="#DDF5E8" opacity=".8"/>
<path d="M755 20 L876 -12 L974 161 L845 199 Z" fill="#DBF5E9" opacity=".8"/>
<path d="M175 740 L338 685 L396 970 L171 994 Z" fill="#DDF6E8" opacity=".8"/>
</g>
<g id="Buildings" transform="rotate(-17 768 512)" opacity=".74">
<rect x="-598" y="-402" width="27" height="40" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-628" y="-412" width="25" height="16" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-524" y="-387" width="45" height="28" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="-520" y="-413" width="48" height="41" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="-525" y="-418" width="32" height="33" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="-368" y="-407" width="26" height="37" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-396" y="-397" width="22" height="29" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-396" y="-396" width="23" height="31" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-278" y="-442" width="33" height="17" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="-260" y="-412" width="45" height="35" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="-276" y="-424" width="30" height="37" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="-170" y="-424" width="32" height="16" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-143" y="-443" width="45" height="24" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="217" y="-422" width="40" height="42" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="199" y="-420" width="26" height="37" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="243" y="-413" width="47" height="26" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="336" y="-443" width="43" height="28" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="321" y="-433" width="39" height="36" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="430" y="-444" width="89" height="61" rx="3" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="562" y="-406" width="46" height="22" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="549" y="-400" width="33" height="35" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="671" y="-400" width="29" height="35" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="673" y="-395" width="31" height="29" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="684" y="-423" width="38" height="19" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="811" y="-435" width="39" height="31" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="835" y="-406" width="27" height="16" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="800" y="-429" width="28" height="17" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="894" y="-445" width="28" height="40" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="889" y="-421" width="49" height="36" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="922" y="-443" width="23" height="39" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="1048" y="-417" width="34" height="16" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1033" y="-418" width="42" height="39" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1164" y="-438" width="48" height="25" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1162" y="-426" width="24" height="37" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1278" y="-433" width="26" height="41" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1309" y="-405" width="38" height="28" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1269" y="-428" width="43" height="33" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1394" y="-414" width="24" height="35" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1406" y="-389" width="46" height="23" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1539" y="-421" width="37" height="24" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1528" y="-402" width="42" height="19" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-657" y="-321" width="76" height="40" rx="3" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-492" y="-303" width="30" height="25" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="-464" y="-307" width="35" height="19" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="-493" y="-296" width="28" height="33" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-419" y="-326" width="50" height="26" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="-378" y="-297" width="33" height="37" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="-270" y="-317" width="46" height="29" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-271" y="-315" width="45" height="38" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-144" y="-293" width="47" height="20" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-176" y="-315" width="48" height="36" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-167" y="-298" width="46" height="28" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="-43" y="-279" width="34" height="22" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-13" y="-280" width="25" height="29" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="70" y="-337" width="68" height="52" rx="2" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="201" y="-334" width="76" height="52" rx="7" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="314" y="-291" width="46" height="36" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="330" y="-307" width="44" height="17" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="427" y="-331" width="81" height="59" rx="3" fill="#E6F0EE" stroke="#D5E6E2" stroke-width="2"/>
<rect x="592" y="-305" width="22" height="35" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="548" y="-277" width="49" height="28" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="684" y="-290" width="26" height="36" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="689" y="-324" width="43" height="42" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="831" y="-313" width="31" height="25" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="817" y="-334" width="35" height="18" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="827" y="-314" width="25" height="26" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="912" y="-336" width="87" height="55" rx="7" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1073" y="-308" width="43" height="26" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="1077" y="-284" width="49" height="25" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1152" y="-313" width="90" height="62" rx="3" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1310" y="-316" width="26" height="40" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1293" y="-310" width="43" height="26" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1311" y="-297" width="48" height="22" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1393" y="-324" width="28" height="19" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1423" y="-301" width="50" height="24" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1539" y="-316" width="22" height="36" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1547" y="-325" width="47" height="41" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-639" y="-210" width="25" height="20" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="-603" y="-218" width="44" height="30" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="-519" y="-212" width="28" height="22" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-498" y="-199" width="32" height="20" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-398" y="-172" width="27" height="19" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-380" y="-166" width="25" height="24" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-288" y="-217" width="75" height="46" rx="7" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="104" y="-201" width="27" height="34" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="118" y="-172" width="44" height="40" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="188" y="-199" width="22" height="18" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="193" y="-191" width="42" height="17" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="350" y="-188" width="51" height="26" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="360" y="-176" width="48" height="25" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="449" y="-203" width="36" height="33" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="432" y="-206" width="26" height="26" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="691" y="-212" width="47" height="40" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="720" y="-194" width="32" height="20" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="840" y="-206" width="47" height="33" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="803" y="-188" width="35" height="34" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="905" y="-220" width="78" height="52" rx="3" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1030" y="-166" width="47" height="37" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="1030" y="-186" width="43" height="26" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1173" y="-193" width="33" height="24" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1143" y="-201" width="44" height="23" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="1168" y="-214" width="24" height="40" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="1289" y="-167" width="42" height="24" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1312" y="-176" width="22" height="24" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="1280" y="-171" width="39" height="42" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="1421" y="-207" width="28" height="25" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1412" y="-196" width="38" height="16" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="1542" y="-170" width="30" height="36" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="1520" y="-193" width="39" height="34" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1517" y="-173" width="40" height="38" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-530" y="-80" width="37" height="16" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-490" y="-97" width="40" height="38" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-406" y="-101" width="84" height="65" rx="2" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-249" y="-77" width="27" height="37" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="-252" y="-106" width="34" height="38" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="-158" y="-100" width="26" height="32" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-137" y="-70" width="50" height="25" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="-140" y="-93" width="51" height="26" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="-19" y="-79" width="27" height="22" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-8" y="-103" width="29" height="24" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="96" y="-56" width="36" height="27" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="84" y="-87" width="42" height="21" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="222" y="-92" width="39" height="41" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="205" y="-89" width="28" height="37" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="312" y="-69" width="26" height="32" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="329" y="-54" width="28" height="27" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="436" y="-90" width="80" height="59" rx="2" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="567" y="-106" width="27" height="42" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="592" y="-83" width="32" height="32" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="699" y="-62" width="22" height="29" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="688" y="-80" width="22" height="37" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="774" y="-93" width="88" height="51" rx="2" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1068" y="-100" width="24" height="26" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1065" y="-105" width="23" height="31" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="1054" y="-109" width="49" height="40" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1185" y="-61" width="28" height="24" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1162" y="-77" width="39" height="38" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1298" y="-94" width="43" height="38" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="1290" y="-83" width="27" height="38" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1385" y="-112" width="91" height="37" rx="3" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1557" y="-105" width="33" height="27" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1524" y="-106" width="42" height="39" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-641" y="14" width="73" height="68" rx="2" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-495" y="43" width="42" height="31" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="-491" y="19" width="29" height="41" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-401" y="4" width="50" height="36" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-374" y="6" width="49" height="22" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-153" y="53" width="22" height="41" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-156" y="58" width="25" height="21" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="-152" y="34" width="34" height="32" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-35" y="39" width="38" height="25" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="-38" y="7" width="42" height="22" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="95" y="44" width="50" height="38" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="90" y="16" width="31" height="31" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="207" y="45" width="24" height="29" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="205" y="33" width="46" height="24" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="350" y="46" width="35" height="20" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="322" y="29" width="43" height="30" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="329" y="44" width="43" height="21" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="418" y="13" width="94" height="60" rx="3" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="558" y="20" width="51" height="22" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="577" y="4" width="49" height="40" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="710" y="44" width="24" height="41" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="705" y="18" width="31" height="42" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="782" y="-1" width="64" height="37" rx="7" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="932" y="8" width="37" height="31" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="907" y="6" width="27" height="17" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="907" y="38" width="46" height="30" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="1051" y="14" width="30" height="24" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1047" y="24" width="31" height="29" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1061" y="26" width="23" height="41" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1130" y="13" width="86" height="36" rx="7" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1283" y="43" width="40" height="41" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1313" y="26" width="37" height="29" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1262" y="40" width="27" height="25" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="1407" y="32" width="51" height="24" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="1383" y="45" width="50" height="26" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="1545" y="28" width="38" height="29" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="1511" y="40" width="45" height="28" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1508" y="32" width="34" height="42" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-610" y="164" width="22" height="29" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="-614" y="167" width="37" height="34" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="-531" y="118" width="66" height="69" rx="3" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-381" y="127" width="46" height="29" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-385" y="138" width="22" height="25" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="-398" y="130" width="29" height="42" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-279" y="129" width="35" height="41" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="-253" y="124" width="24" height="33" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="-154" y="134" width="35" height="28" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="-152" y="118" width="48" height="17" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-14" y="135" width="44" height="31" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="-9" y="138" width="34" height="18" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="64" y="116" width="46" height="33" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="72" y="132" width="48" height="18" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="109" y="121" width="34" height="21" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="208" y="158" width="27" height="42" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="237" y="159" width="49" height="24" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="346" y="132" width="31" height="35" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="354" y="140" width="46" height="37" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="450" y="152" width="40" height="16" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="436" y="142" width="45" height="24" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="584" y="146" width="40" height="41" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="544" y="151" width="47" height="40" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="666" y="172" width="38" height="28" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="677" y="170" width="33" height="32" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="778" y="168" width="28" height="28" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="828" y="147" width="50" height="29" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="821" y="139" width="38" height="36" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="925" y="141" width="31" height="39" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="939" y="158" width="44" height="21" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="917" y="151" width="51" height="40" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1059" y="131" width="23" height="20" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1050" y="156" width="27" height="40" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1189" y="145" width="44" height="17" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1161" y="124" width="51" height="18" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1269" y="142" width="50" height="22" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1303" y="141" width="46" height="42" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1410" y="130" width="33" height="18" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1412" y="131" width="23" height="42" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1420" y="141" width="45" height="37" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1550" y="148" width="41" height="16" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="1513" y="154" width="46" height="19" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="-655" y="236" width="92" height="49" rx="3" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-525" y="262" width="32" height="23" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="-518" y="260" width="22" height="35" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-285" y="232" width="95" height="40" rx="7" fill="#E6F0EE" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-134" y="246" width="49" height="19" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="-141" y="262" width="42" height="25" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="-28" y="259" width="24" height="33" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="-16" y="234" width="39" height="39" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-39" y="256" width="24" height="37" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="202" y="266" width="40" height="40" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="232" y="255" width="24" height="36" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="311" y="247" width="72" height="54" rx="7" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="456" y="263" width="37" height="20" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="436" y="236" width="23" height="31" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="570" y="273" width="45" height="37" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="588" y="251" width="39" height="41" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="553" y="260" width="35" height="20" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="729" y="252" width="51" height="42" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="696" y="233" width="39" height="39" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="783" y="245" width="66" height="43" rx="7" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="899" y="225" width="29" height="39" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="902" y="224" width="23" height="20" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="903" y="233" width="29" height="30" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1053" y="268" width="27" height="37" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1055" y="252" width="31" height="38" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="1260" y="241" width="47" height="25" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1301" y="256" width="37" height="26" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1384" y="263" width="36" height="29" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1406" y="247" width="32" height="17" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1514" y="268" width="33" height="28" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="1516" y="248" width="40" height="19" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-653" y="357" width="43" height="29" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="-648" y="354" width="45" height="28" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-511" y="350" width="39" height="41" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-504" y="369" width="37" height="39" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="-390" y="361" width="45" height="42" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-376" y="362" width="31" height="18" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-253" y="359" width="29" height="21" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="-275" y="348" width="35" height="38" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="-282" y="355" width="49" height="40" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-49" y="336" width="64" height="42" rx="2" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="103" y="364" width="42" height="32" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="75" y="375" width="37" height="23" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="177" y="338" width="88" height="69" rx="7" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="305" y="341" width="69" height="51" rx="2" fill="#E6F0EE" stroke="#D5E6E2" stroke-width="2"/>
<rect x="464" y="370" width="23" height="38" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="465" y="357" width="37" height="17" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="430" y="386" width="46" height="25" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="557" y="351" width="29" height="20" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="582" y="349" width="47" height="23" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="697" y="370" width="36" height="39" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="662" y="379" width="33" height="36" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="831" y="344" width="45" height="29" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="827" y="378" width="38" height="19" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="949" y="355" width="49" height="19" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="937" y="357" width="43" height="42" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="939" y="353" width="44" height="19" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1050" y="374" width="42" height="20" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1047" y="364" width="30" height="31" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1381" y="357" width="65" height="70" rx="7" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1509" y="373" width="24" height="18" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1495" y="341" width="30" height="22" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1539" y="369" width="44" height="38" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="-616" y="470" width="49" height="36" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="-611" y="474" width="44" height="37" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="-638" y="476" width="37" height="24" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-503" y="470" width="37" height="32" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-513" y="491" width="28" height="39" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-418" y="459" width="77" height="52" rx="2" fill="#E6F0EE" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-146" y="476" width="47" height="36" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="-113" y="472" width="28" height="17" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="-20" y="471" width="40" height="30" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-41" y="502" width="35" height="29" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-55" y="486" width="28" height="20" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="75" y="485" width="48" height="40" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="90" y="499" width="38" height="23" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="213" y="476" width="39" height="31" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="217" y="494" width="40" height="19" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="337" y="482" width="42" height="19" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="313" y="506" width="47" height="41" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="465" y="481" width="30" height="17" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="458" y="472" width="38" height="34" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="552" y="484" width="43" height="41" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="558" y="498" width="34" height="41" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="692" y="479" width="30" height="36" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="712" y="486" width="30" height="34" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="792" y="470" width="28" height="42" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="829" y="502" width="36" height="37" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="801" y="475" width="34" height="35" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="931" y="475" width="24" height="42" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="960" y="482" width="28" height="17" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="1067" y="456" width="41" height="40" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="1025" y="450" width="32" height="19" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="1174" y="498" width="38" height="33" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="1145" y="469" width="38" height="34" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1264" y="491" width="36" height="22" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1264" y="468" width="25" height="40" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1422" y="493" width="48" height="20" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1404" y="480" width="29" height="23" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-514" y="572" width="86" height="38" rx="2" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-372" y="587" width="46" height="34" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-357" y="586" width="44" height="30" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-167" y="561" width="90" height="59" rx="3" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-22" y="604" width="42" height="29" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-21" y="589" width="35" height="25" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="99" y="611" width="41" height="27" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="102" y="612" width="26" height="25" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="214" y="581" width="24" height="32" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="211" y="588" width="34" height="21" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="212" y="574" width="48" height="17" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="316" y="584" width="30" height="31" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="337" y="569" width="47" height="34" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="553" y="585" width="62" height="57" rx="7" fill="#E6F0EE" stroke="#D5E6E2" stroke-width="2"/>
<rect x="696" y="609" width="30" height="35" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="700" y="602" width="36" height="37" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="697" y="588" width="42" height="27" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="791" y="582" width="68" height="41" rx="3" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1191" y="565" width="46" height="37" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="1189" y="599" width="36" height="18" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1306" y="597" width="22" height="26" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1265" y="586" width="25" height="37" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="1302" y="576" width="38" height="35" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1387" y="599" width="29" height="39" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="1389" y="621" width="28" height="35" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1403" y="592" width="41" height="28" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="1519" y="596" width="46" height="37" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1530" y="612" width="39" height="20" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-519" y="694" width="60" height="43" rx="3" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-376" y="712" width="46" height="32" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-381" y="721" width="32" height="36" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="-286" y="695" width="37" height="24" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="-260" y="707" width="26" height="31" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="-150" y="718" width="45" height="24" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-147" y="688" width="39" height="40" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="-7" y="712" width="30" height="30" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="-15" y="704" width="28" height="31" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="74" y="686" width="91" height="46" rx="2" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="188" y="686" width="65" height="51" rx="7" fill="#E6F0EE" stroke="#D5E6E2" stroke-width="2"/>
<rect x="322" y="706" width="29" height="23" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="310" y="682" width="27" height="24" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="329" y="708" width="49" height="39" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="459" y="688" width="35" height="22" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="445" y="679" width="41" height="20" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="463" y="708" width="39" height="23" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="555" y="671" width="77" height="38" rx="7" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="687" y="695" width="37" height="41" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="705" y="720" width="35" height="25" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1030" y="695" width="83" height="46" rx="2" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1176" y="707" width="43" height="18" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="1194" y="685" width="43" height="42" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1296" y="691" width="34" height="36" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="1309" y="690" width="28" height="31" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1277" y="687" width="31" height="40" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1398" y="700" width="40" height="38" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="1409" y="703" width="41" height="24" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1496" y="691" width="77" height="50" rx="7" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-657" y="800" width="84" height="39" rx="7" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="-496" y="837" width="40" height="20" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="-499" y="844" width="27" height="25" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-280" y="802" width="29" height="39" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-250" y="800" width="47" height="34" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="-231" y="819" width="51" height="30" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-13" y="793" width="41" height="25" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="0" y="798" width="29" height="38" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="115" y="828" width="31" height="38" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="93" y="813" width="41" height="21" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="104" y="815" width="25" height="20" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="217" y="829" width="24" height="18" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="209" y="801" width="44" height="21" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="324" y="836" width="41" height="41" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="315" y="829" width="42" height="36" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="460" y="820" width="50" height="35" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="459" y="819" width="34" height="17" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="464" y="802" width="47" height="27" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="563" y="798" width="25" height="16" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="567" y="798" width="29" height="23" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="671" y="810" width="22" height="25" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="666" y="808" width="40" height="19" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="838" y="823" width="27" height="40" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="820" y="796" width="29" height="21" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1042" y="807" width="31" height="26" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1036" y="820" width="34" height="19" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="1042" y="813" width="27" height="17" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1144" y="816" width="34" height="18" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="1162" y="836" width="48" height="38" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1247" y="793" width="58" height="68" rx="7" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1388" y="827" width="28" height="19" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="1402" y="830" width="29" height="16" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1407" y="833" width="45" height="22" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="1505" y="838" width="37" height="38" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1537" y="828" width="50" height="30" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="-594" y="952" width="33" height="38" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-607" y="921" width="50" height="21" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-481" y="930" width="24" height="29" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="-507" y="916" width="30" height="37" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="-355" y="905" width="46" height="24" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="-389" y="907" width="39" height="22" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-264" y="941" width="39" height="33" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-275" y="944" width="30" height="25" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-118" y="929" width="44" height="27" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-159" y="920" width="48" height="39" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-44" y="919" width="87" height="47" rx="2" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="95" y="931" width="30" height="26" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="105" y="923" width="29" height="40" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="229" y="920" width="36" height="38" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="192" y="939" width="37" height="30" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="214" y="949" width="30" height="35" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="352" y="943" width="45" height="31" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="322" y="932" width="28" height="20" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="545" y="926" width="48" height="28" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="545" y="916" width="39" height="16" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="569" y="931" width="38" height="34" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="676" y="945" width="41" height="27" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="707" y="922" width="24" height="38" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="813" y="926" width="27" height="22" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="783" y="929" width="47" height="19" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="891" y="902" width="87" height="63" rx="2" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1068" y="900" width="32" height="34" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="1054" y="924" width="35" height="20" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1137" y="908" width="89" height="43" rx="2" fill="#E6F0EE" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1253" y="896" width="61" height="61" rx="2" fill="#E5EFED" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1375" y="898" width="71" height="59" rx="2" fill="#D9E9E6" stroke="#D5E6E2" stroke-width="2"/>
<rect x="1502" y="930" width="51" height="19" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="1520" y="938" width="26" height="28" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="-619" y="1050" width="34" height="25" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-613" y="1030" width="23" height="42" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="-604" y="1045" width="46" height="42" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="-485" y="1039" width="35" height="18" rx="1" fill="#D8E7E5" opacity=".81"/>
<rect x="-478" y="1022" width="40" height="23" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="-385" y="1045" width="38" height="29" rx="2" fill="#DEEBE9" opacity=".81"/>
<rect x="-373" y="1026" width="26" height="28" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-136" y="1039" width="35" height="26" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="-153" y="1031" width="45" height="23" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="-15" y="1043" width="38" height="27" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-32" y="1036" width="26" height="25" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="-31" y="1020" width="50" height="26" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="106" y="1034" width="45" height="39" rx="4" fill="#D3E6E3" opacity=".81"/>
<rect x="86" y="1043" width="30" height="18" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="110" y="1029" width="33" height="32" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="181" y="1030" width="51" height="36" rx="1" fill="#DEEBE9" opacity=".81"/>
<rect x="185" y="1037" width="28" height="20" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="353" y="1030" width="26" height="35" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="341" y="1045" width="36" height="28" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="474" y="1057" width="25" height="28" rx="4" fill="#DEEBE9" opacity=".81"/>
<rect x="450" y="1040" width="46" height="26" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="469" y="1057" width="31" height="42" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="536" y="1032" width="72" height="41" rx="3" fill="#DFEBE9" stroke="#D5E6E2" stroke-width="2"/>
<rect x="695" y="1041" width="25" height="37" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="657" y="1045" width="37" height="33" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="830" y="1029" width="38" height="31" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="809" y="1019" width="51" height="29" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="922" y="1043" width="48" height="35" rx="1" fill="#D3E6E3" opacity=".81"/>
<rect x="947" y="1047" width="23" height="26" rx="4" fill="#E7EFEE" opacity=".81"/>
<rect x="1170" y="1054" width="47" height="19" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1190" y="1037" width="37" height="22" rx="1" fill="#E7EFEE" opacity=".81"/>
<rect x="1311" y="1029" width="32" height="31" rx="2" fill="#D3E6E3" opacity=".81"/>
<rect x="1312" y="1037" width="27" height="32" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1408" y="1062" width="47" height="33" rx="2" fill="#E7EFEE" opacity=".81"/>
<rect x="1413" y="1029" width="24" height="41" rx="2" fill="#D8E7E5" opacity=".81"/>
<rect x="1526" y="1040" width="47" height="40" rx="4" fill="#D8E7E5" opacity=".81"/>
<rect x="1503" y="1043" width="34" height="37" rx="4" fill="#DEEBE9" opacity=".81"/>
</g>
<g id="Water">
<path d="M 753 -35 C 747 75 805 157 859 215 C 917 280 1030 285 1093 346 C 1158 409 1173 506 1240 562 C 1360 661 1457 698 1561 838" fill="none" stroke="#E4FCF8" stroke-width="124" stroke-linecap="round" opacity=".99"/>
<path d="M 753 -35 C 747 75 805 157 859 215 C 917 280 1030 285 1093 346 C 1158 409 1173 506 1240 562 C 1360 661 1457 698 1561 838" fill="none" stroke="url(#river)" stroke-width="94" stroke-linecap="round" opacity=".92"/>
<path d="M 766 -17 C 757 63 811 150 861 204 C 931 272 1042 296 1101 351 C 1167 421 1177 509 1248 573 C 1372 666 1457 709 1550 818" fill="none" stroke="#E5FFFF" stroke-width="3" stroke-linecap="round" opacity=".24"/>
<path d="M112 347 C134 315 190 340 224 302 C254 267 267 269 292 286 C333 315 305 375 264 402 C201 446 120 418 105 388 C94 369 101 358 112 347 Z" fill="#AFEBF8" opacity=".82"/>
<path d="M336 486 C367 461 394 497 421 509 C461 529 456 586 423 593 C393 598 376 564 346 558 C315 550 310 513 336 486Z" fill="#B2ECF8" opacity=".85"/>
</g>
<g id="RoadNetwork" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M-156 172 C260 92 742 -12 1578 -242" fill="none" stroke="#D5E9E5" stroke-width="36" opacity=".47"/>
<path d="M-156 172 C260 92 742 -12 1578 -242" fill="none" stroke="#FFFFFF" stroke-width="29" opacity=".89"/>
<path d="M-134 378 C180 300 450 236 666 165 C877 101 1183 29 1635 -96" fill="none" stroke="#D5E9E5" stroke-width="33" opacity=".47"/>
<path d="M-134 378 C180 300 450 236 666 165 C877 101 1183 29 1635 -96" fill="none" stroke="#FFFFFF" stroke-width="26" opacity=".89"/>
<path d="M-128 556 C222 469 539 389 856 297 C1050 239 1300 158 1692 75" fill="none" stroke="#D5E9E5" stroke-width="36" opacity=".47"/>
<path d="M-128 556 C222 469 539 389 856 297 C1050 239 1300 158 1692 75" fill="none" stroke="#FFFFFF" stroke-width="29" opacity=".89"/>
<path d="M-132 758 C290 655 631 561 921 484 C1189 413 1406 342 1612 294" fill="none" stroke="#D5E9E5" stroke-width="36" opacity=".47"/>
<path d="M-132 758 C290 655 631 561 921 484 C1189 413 1406 342 1612 294" fill="none" stroke="#FFFFFF" stroke-width="29" opacity=".89"/>
<path d="M-102 923 C239 845 521 755 808 687 C1051 621 1390 516 1644 459" fill="none" stroke="#D5E9E5" stroke-width="45" opacity=".47"/>
<path d="M-102 923 C239 845 521 755 808 687 C1051 621 1390 516 1644 459" fill="none" stroke="#FFFFFF" stroke-width="38" opacity=".89"/>
<path d="M-140 1117 C290 1015 524 924 864 843 C1130 772 1403 705 1636 643" fill="none" stroke="#D5E9E5" stroke-width="33" opacity=".47"/>
<path d="M-140 1117 C290 1015 524 924 864 843 C1130 772 1403 705 1636 643" fill="none" stroke="#FFFFFF" stroke-width="26" opacity=".89"/>
<path d="M170 -137 C196 91 249 311 314 530 C355 655 402 847 469 1125" fill="none" stroke="#D5E9E5" stroke-width="39" opacity=".47"/>
<path d="M170 -137 C196 91 249 311 314 530 C355 655 402 847 469 1125" fill="none" stroke="#FFFFFF" stroke-width="32" opacity=".89"/>
<path d="M386 -153 C432 43 458 253 529 455 C590 648 638 892 680 1143" fill="none" stroke="#D5E9E5" stroke-width="36" opacity=".47"/>
<path d="M386 -153 C432 43 458 253 529 455 C590 648 638 892 680 1143" fill="none" stroke="#FFFFFF" stroke-width="29" opacity=".89"/>
<path d="M620 -144 C670 89 733 285 786 514 C829 683 876 920 922 1150" fill="none" stroke="#D5E9E5" stroke-width="36" opacity=".47"/>
<path d="M620 -144 C670 89 733 285 786 514 C829 683 876 920 922 1150" fill="none" stroke="#FFFFFF" stroke-width="29" opacity=".89"/>
<path d="M1001 -137 C1015 20 1045 146 1094 307 C1150 525 1209 793 1270 1187" fill="none" stroke="#D5E9E5" stroke-width="39" opacity=".47"/>
<path d="M1001 -137 C1015 20 1045 146 1094 307 C1150 525 1209 793 1270 1187" fill="none" stroke="#FFFFFF" stroke-width="32" opacity=".89"/>
<path d="M1307 -145 C1332 45 1374 188 1414 373 C1469 607 1540 822 1632 1178" fill="none" stroke="#D5E9E5" stroke-width="33" opacity=".47"/>
<path d="M1307 -145 C1332 45 1374 188 1414 373 C1469 607 1540 822 1632 1178" fill="none" stroke="#FFFFFF" stroke-width="26" opacity=".89"/>
<path d="M-52 645 C174 608 226 536 293 481 C368 409 394 333 518 319" fill="none" stroke="#D5E9E5" stroke-width="36" opacity=".47"/>
<path d="M-52 645 C174 608 226 536 293 481 C368 409 394 333 518 319" fill="none" stroke="#FFFFFF" stroke-width="29" opacity=".89"/>
<path d="M978 990 C1062 920 1097 820 1231 787 C1366 759 1436 655 1530 605" fill="none" stroke="#D5E9E5" stroke-width="45" opacity=".47"/>
<path d="M978 990 C1062 920 1097 820 1231 787 C1366 759 1436 655 1530 605" fill="none" stroke="#FFFFFF" stroke-width="38" opacity=".89"/>
</g>
<g id="MajorRoads">
<path d="M-28 500 C 253 436 470 368 713 308 C 919 253 1112 175 1570 63" fill="none" stroke="#DAEEEA" stroke-width="43" opacity=".65"/>
<path d="M-28 500 C 253 436 470 368 713 308 C 919 253 1112 175 1570 63" fill="none" stroke="#FFFFFF" stroke-width="33" opacity=".94"/>
<path d="M-16 840 C 198 781 441 714 693 638 C 1011 549 1262 479 1546 407" fill="none" stroke="#DAEEEA" stroke-width="42" opacity=".65"/>
<path d="M-16 840 C 198 781 441 714 693 638 C 1011 549 1262 479 1546 407" fill="none" stroke="#FFFFFF" stroke-width="32" opacity=".94"/>
<path d="M 432 -66 C 460 180 487 307 518 453 C 550 593 571 798 640 1098" fill="none" stroke="#DAEEEA" stroke-width="40" opacity=".65"/>
<path d="M 432 -66 C 460 180 487 307 518 453 C 550 593 571 798 640 1098" fill="none" stroke="#FFFFFF" stroke-width="30" opacity=".94"/>
<path d="M 1016 -35 C 1061 168 1121 389 1191 579 C 1243 741 1261 937 1302 1115" fill="none" stroke="#DAEEEA" stroke-width="37" opacity=".65"/>
<path d="M 1016 -35 C 1061 168 1121 389 1191 579 C 1243 741 1261 937 1302 1115" fill="none" stroke="#FFFFFF" stroke-width="27" opacity=".94"/>
</g>
<g id="Trees">
<path d="M82 295 L82 314" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="82" cy="292" r="14" fill="#ACDDC5" opacity=".78"/>
<circle cx="79" cy="288" r="7.0" fill="#D1F1DE" opacity=".38"/>
<path d="M171 248 L171 264" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="171" cy="245" r="11" fill="#A9E4CB" opacity=".78"/>
<circle cx="169" cy="242" r="5.5" fill="#D1F1DE" opacity=".38"/>
<path d="M215 227 L215 242" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="215" cy="224" r="10" fill="#A9E4CB" opacity=".78"/>
<circle cx="213" cy="221" r="5.0" fill="#D1F1DE" opacity=".38"/>
<path d="M96 444 L96 462" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="96" cy="441" r="13" fill="#ACDDC5" opacity=".78"/>
<circle cx="93" cy="437" r="6.5" fill="#D1F1DE" opacity=".38"/>
<path d="M130 461 L130 479" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="130" cy="458" r="13" fill="#BFECD6" opacity=".78"/>
<circle cx="127" cy="454" r="6.5" fill="#D1F1DE" opacity=".38"/>
<path d="M406 308 L406 324" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="406" cy="305" r="11" fill="#ACDDC5" opacity=".78"/>
<circle cx="404" cy="302" r="5.5" fill="#D1F1DE" opacity=".38"/>
<path d="M585 351 L585 369" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="585" cy="348" r="13" fill="#B4E7CE" opacity=".78"/>
<circle cx="582" cy="344" r="6.5" fill="#D1F1DE" opacity=".38"/>
<path d="M634 378 L634 395" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="634" cy="375" r="12" fill="#B4E7CE" opacity=".78"/>
<circle cx="631" cy="371" r="6.0" fill="#D1F1DE" opacity=".38"/>
<path d="M563 437 L563 456" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="563" cy="434" r="14" fill="#ACDDC5" opacity=".78"/>
<circle cx="560" cy="430" r="7.0" fill="#D1F1DE" opacity=".38"/>
<path d="M438 466 L438 489" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="438" cy="463" r="18" fill="#BFECD6" opacity=".78"/>
<circle cx="434" cy="457" r="9.0" fill="#D1F1DE" opacity=".38"/>
<path d="M295 505 L295 523" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="295" cy="502" r="13" fill="#A9E4CB" opacity=".78"/>
<circle cx="292" cy="498" r="6.5" fill="#D1F1DE" opacity=".38"/>
<path d="M373 622 L373 644" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="373" cy="619" r="17" fill="#ACDDC5" opacity=".78"/>
<circle cx="369" cy="614" r="8.5" fill="#D1F1DE" opacity=".38"/>
<path d="M473 571 L473 595" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="473" cy="568" r="19" fill="#ACDDC5" opacity=".78"/>
<circle cx="469" cy="562" r="9.5" fill="#D1F1DE" opacity=".38"/>
<path d="M715 157 L715 176" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="715" cy="154" r="14" fill="#BFECD6" opacity=".78"/>
<circle cx="712" cy="150" r="7.0" fill="#D1F1DE" opacity=".38"/>
<path d="M663 137 L663 158" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="663" cy="134" r="16" fill="#ACDDC5" opacity=".78"/>
<circle cx="659" cy="129" r="8.0" fill="#D1F1DE" opacity=".38"/>
<path d="M748 188 L748 205" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="748" cy="185" r="12" fill="#BFECD6" opacity=".78"/>
<circle cx="745" cy="181" r="6.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1036 55 L1036 76" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1036" cy="52" r="16" fill="#ACDDC5" opacity=".78"/>
<circle cx="1032" cy="47" r="8.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1063 87 L1063 107" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1063" cy="84" r="15" fill="#ACDDC5" opacity=".78"/>
<circle cx="1060" cy="79" r="7.5" fill="#D1F1DE" opacity=".38"/>
<path d="M1156 151 L1156 166" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1156" cy="148" r="10" fill="#B4E7CE" opacity=".78"/>
<circle cx="1154" cy="145" r="5.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1389 295 L1389 312" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1389" cy="292" r="12" fill="#BFECD6" opacity=".78"/>
<circle cx="1386" cy="288" r="6.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1414 309 L1414 326" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1414" cy="306" r="12" fill="#A9E4CB" opacity=".78"/>
<circle cx="1411" cy="302" r="6.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1369 363 L1369 385" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1369" cy="360" r="17" fill="#B4E7CE" opacity=".78"/>
<circle cx="1365" cy="355" r="8.5" fill="#D1F1DE" opacity=".38"/>
<path d="M1302 479 L1302 498" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1302" cy="476" r="14" fill="#ACDDC5" opacity=".78"/>
<circle cx="1299" cy="472" r="7.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1259 477 L1259 494" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1259" cy="474" r="12" fill="#B4E7CE" opacity=".78"/>
<circle cx="1256" cy="470" r="6.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1120 547 L1120 566" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1120" cy="544" r="14" fill="#BFECD6" opacity=".78"/>
<circle cx="1117" cy="540" r="7.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1081 629 L1081 653" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1081" cy="626" r="19" fill="#B4E7CE" opacity=".78"/>
<circle cx="1077" cy="620" r="9.5" fill="#D1F1DE" opacity=".38"/>
<path d="M1175 614 L1175 633" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1175" cy="611" r="14" fill="#A9E4CB" opacity=".78"/>
<circle cx="1172" cy="607" r="7.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1439 583 L1439 602" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1439" cy="580" r="14" fill="#B4E7CE" opacity=".78"/>
<circle cx="1436" cy="576" r="7.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1272 702 L1272 723" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1272" cy="699" r="16" fill="#ACDDC5" opacity=".78"/>
<circle cx="1268" cy="694" r="8.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1301 733 L1301 756" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1301" cy="730" r="18" fill="#ACDDC5" opacity=".78"/>
<circle cx="1297" cy="724" r="9.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1224 759 L1224 783" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1224" cy="756" r="19" fill="#B4E7CE" opacity=".78"/>
<circle cx="1220" cy="750" r="9.5" fill="#D1F1DE" opacity=".38"/>
<path d="M1285 802 L1285 821" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1285" cy="799" r="14" fill="#ACDDC5" opacity=".78"/>
<circle cx="1282" cy="795" r="7.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1336 816 L1336 835" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1336" cy="813" r="14" fill="#B4E7CE" opacity=".78"/>
<circle cx="1333" cy="809" r="7.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1382 791 L1382 806" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1382" cy="788" r="10" fill="#B4E7CE" opacity=".78"/>
<circle cx="1380" cy="785" r="5.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1434 607 L1434 630" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1434" cy="604" r="18" fill="#BFECD6" opacity=".78"/>
<circle cx="1430" cy="598" r="9.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1420 882 L1420 897" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1420" cy="879" r="10" fill="#BFECD6" opacity=".78"/>
<circle cx="1418" cy="876" r="5.0" fill="#D1F1DE" opacity=".38"/>
<path d="M73 751 L73 771" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="73" cy="748" r="15" fill="#ACDDC5" opacity=".78"/>
<circle cx="70" cy="743" r="7.5" fill="#D1F1DE" opacity=".38"/>
<path d="M400 804 L400 826" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="400" cy="801" r="17" fill="#BFECD6" opacity=".78"/>
<circle cx="396" cy="796" r="8.5" fill="#D1F1DE" opacity=".38"/>
<path d="M505 789 L505 813" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="505" cy="786" r="19" fill="#A9E4CB" opacity=".78"/>
<circle cx="501" cy="780" r="9.5" fill="#D1F1DE" opacity=".38"/>
<path d="M641 773 L641 793" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="641" cy="770" r="15" fill="#A9E4CB" opacity=".78"/>
<circle cx="638" cy="765" r="7.5" fill="#D1F1DE" opacity=".38"/>
<path d="M316 569 L316 584" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="316" cy="566" r="10" fill="#A9E4CB" opacity=".78"/>
<circle cx="314" cy="563" r="5.0" fill="#D1F1DE" opacity=".38"/>
<path d="M309 805 L309 829" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="309" cy="802" r="19" fill="#B4E7CE" opacity=".78"/>
<circle cx="305" cy="796" r="9.5" fill="#D1F1DE" opacity=".38"/>
<path d="M347 831 L347 854" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="347" cy="828" r="18" fill="#BFECD6" opacity=".78"/>
<circle cx="343" cy="822" r="9.0" fill="#D1F1DE" opacity=".38"/>
<path d="M1169 803 L1169 823" fill="none" stroke="#B9CFAF" stroke-width="3" opacity=".62"/>
<circle cx="1169" cy="800" r="15" fill="#A9E4CB" opacity=".78"/>
<circle cx="1166" cy="795" r="7.5" fill="#D1F1DE" opacity=".38"/>
</g>
</g>`
