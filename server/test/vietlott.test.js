/**
 * CHUYÊN GIA VIETLOTT — test cho `src/vietlott.js` + khối miễn trừ do SERVER gắn ở `src/agent.js`.
 *
 * Nguyên tắc trung thực được test ở đây: mọi câu trả lời về Vietlott phải nói "gợi ý theo thống kê
 * các kỳ quay đã qua", không được hứa trúng, và khối miễn trừ (kèm xác suất thật của giải đặc biệt)
 * do server tự ghép — không phụ thuộc model có nhớ hay không.
 *
 * FIXTURE LÀ DỮ LIỆU THẬT: 21 kỳ Mega 6/45 và 18 kỳ Power 6/55 dưới đây là kết quả THẬT lấy từ
 * minhngoc.net.vn (kỳ mới nhất: Mega #01565 ngày 20/09/2026, Power ngày 19/09/2026). Khối HTML giữ
 * đúng markup thật của nguồn (đã bỏ CSS/boilerplate); số liệu không sửa một chữ số nào. Nhờ vậy test
 * chạy được OFFLINE mà vẫn kiểm tra parser trên dữ liệu thật, không phải dữ liệu tự bịa.
 */
import "./helpers.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

const { initDb } = await import("../src/db.js");
initDb();
const vl = await import("../src/vietlott.js");
const skills = await import("../src/skills/index.js");
const settings = await import("../src/settings.js");
const { formatVietlottDisclaimer } = await import("../src/agent.js");
const { registerAdmin, chat, textOf, closeServer } = await import("./helpers.js");

after(async () => {
  await closeServer();
});

/** 21 kỳ Mega 6/45 thật (05/08/2026 → 20/09/2026), markup nguyên bản của nguồn. */
const MEGA_HTML = `
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/20-09-2026.html">NG&Agrave;Y: 20/09/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01565</span> | Ng&agrave;y quay thưởng 20/09/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">10</div></li> <li> <div class="finnish2 bool">15</div></li> <li> <div class="finnish3 bool">16</div></li> <li> <div class="finnish4 bool">27</div></li> <li> <div class="finnish5 bool">33</div></li> <li> <div class="finnish6 bool">38</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/18-09-2026.html">NG&Agrave;Y: 18/09/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01564</span> | Ng&agrave;y quay thưởng 18/09/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">07</div></li> <li> <div class="finnish2 bool">12</div></li> <li> <div class="finnish3 bool">26</div></li> <li> <div class="finnish4 bool">27</div></li> <li> <div class="finnish5 bool">41</div></li> <li> <div class="finnish6 bool">43</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/16-09-2026.html">NG&Agrave;Y: 16/09/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01563</span> | Ng&agrave;y quay thưởng 16/09/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">01</div></li> <li> <div class="finnish2 bool">03</div></li> <li> <div class="finnish3 bool">10</div></li> <li> <div class="finnish4 bool">11</div></li> <li> <div class="finnish5 bool">18</div></li> <li> <div class="finnish6 bool">23</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/13-09-2026.html">NG&Agrave;Y: 13/09/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01562</span> | Ng&agrave;y quay thưởng 13/09/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">04</div></li> <li> <div class="finnish2 bool">12</div></li> <li> <div class="finnish3 bool">31</div></li> <li> <div class="finnish4 bool">34</div></li> <li> <div class="finnish5 bool">38</div></li> <li> <div class="finnish6 bool">41</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/11-09-2026.html">NG&Agrave;Y: 11/09/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01561</span> | Ng&agrave;y quay thưởng 11/09/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">14</div></li> <li> <div class="finnish2 bool">18</div></li> <li> <div class="finnish3 bool">20</div></li> <li> <div class="finnish4 bool">21</div></li> <li> <div class="finnish5 bool">26</div></li> <li> <div class="finnish6 bool">27</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/09-09-2026.html">NG&Agrave;Y: 09/09/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01560</span> | Ng&agrave;y quay thưởng 09/09/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">12</div></li> <li> <div class="finnish2 bool">17</div></li> <li> <div class="finnish3 bool">20</div></li> <li> <div class="finnish4 bool">21</div></li> <li> <div class="finnish5 bool">36</div></li> <li> <div class="finnish6 bool">43</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/06-09-2026.html">NG&Agrave;Y: 06/09/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01559</span> | Ng&agrave;y quay thưởng 06/09/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">09</div></li> <li> <div class="finnish2 bool">14</div></li> <li> <div class="finnish3 bool">22</div></li> <li> <div class="finnish4 bool">26</div></li> <li> <div class="finnish5 bool">27</div></li> <li> <div class="finnish6 bool">40</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/04-09-2026.html">NG&Agrave;Y: 04/09/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01558</span> | Ng&agrave;y quay thưởng 04/09/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">16</div></li> <li> <div class="finnish2 bool">21</div></li> <li> <div class="finnish3 bool">23</div></li> <li> <div class="finnish4 bool">29</div></li> <li> <div class="finnish5 bool">34</div></li> <li> <div class="finnish6 bool">45</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/02-09-2026.html">NG&Agrave;Y: 02/09/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01557</span> | Ng&agrave;y quay thưởng 02/09/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">06</div></li> <li> <div class="finnish2 bool">09</div></li> <li> <div class="finnish3 bool">27</div></li> <li> <div class="finnish4 bool">29</div></li> <li> <div class="finnish5 bool">35</div></li> <li> <div class="finnish6 bool">44</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/30-08-2026.html">NG&Agrave;Y: 30/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01556</span> | Ng&agrave;y quay thưởng 30/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">01</div></li> <li> <div class="finnish2 bool">03</div></li> <li> <div class="finnish3 bool">12</div></li> <li> <div class="finnish4 bool">15</div></li> <li> <div class="finnish5 bool">37</div></li> <li> <div class="finnish6 bool">45</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/28-08-2026.html">NG&Agrave;Y: 28/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01555</span> | Ng&agrave;y quay thưởng 28/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">03</div></li> <li> <div class="finnish2 bool">13</div></li> <li> <div class="finnish3 bool">15</div></li> <li> <div class="finnish4 bool">22</div></li> <li> <div class="finnish5 bool">36</div></li> <li> <div class="finnish6 bool">39</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/26-08-2026.html">NG&Agrave;Y: 26/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01554</span> | Ng&agrave;y quay thưởng 26/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">03</div></li> <li> <div class="finnish2 bool">10</div></li> <li> <div class="finnish3 bool">11</div></li> <li> <div class="finnish4 bool">16</div></li> <li> <div class="finnish5 bool">33</div></li> <li> <div class="finnish6 bool">40</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/23-08-2026.html">NG&Agrave;Y: 23/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01553</span> | Ng&agrave;y quay thưởng 23/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">04</div></li> <li> <div class="finnish2 bool">16</div></li> <li> <div class="finnish3 bool">17</div></li> <li> <div class="finnish4 bool">22</div></li> <li> <div class="finnish5 bool">32</div></li> <li> <div class="finnish6 bool">39</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/21-08-2026.html">NG&Agrave;Y: 21/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01552</span> | Ng&agrave;y quay thưởng 21/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">07</div></li> <li> <div class="finnish2 bool">26</div></li> <li> <div class="finnish3 bool">31</div></li> <li> <div class="finnish4 bool">38</div></li> <li> <div class="finnish5 bool">43</div></li> <li> <div class="finnish6 bool">45</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/19-08-2026.html">NG&Agrave;Y: 19/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01551</span> | Ng&agrave;y quay thưởng 19/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">06</div></li> <li> <div class="finnish2 bool">15</div></li> <li> <div class="finnish3 bool">18</div></li> <li> <div class="finnish4 bool">33</div></li> <li> <div class="finnish5 bool">40</div></li> <li> <div class="finnish6 bool">43</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/16-08-2026.html">NG&Agrave;Y: 16/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01550</span> | Ng&agrave;y quay thưởng 16/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">06</div></li> <li> <div class="finnish2 bool">07</div></li> <li> <div class="finnish3 bool">15</div></li> <li> <div class="finnish4 bool">19</div></li> <li> <div class="finnish5 bool">36</div></li> <li> <div class="finnish6 bool">41</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/14-08-2026.html">NG&Agrave;Y: 14/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01549</span> | Ng&agrave;y quay thưởng 14/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">07</div></li> <li> <div class="finnish2 bool">09</div></li> <li> <div class="finnish3 bool">13</div></li> <li> <div class="finnish4 bool">31</div></li> <li> <div class="finnish5 bool">35</div></li> <li> <div class="finnish6 bool">44</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/12-08-2026.html">NG&Agrave;Y: 12/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01548</span> | Ng&agrave;y quay thưởng 12/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">15</div></li> <li> <div class="finnish2 bool">17</div></li> <li> <div class="finnish3 bool">22</div></li> <li> <div class="finnish4 bool">29</div></li> <li> <div class="finnish5 bool">33</div></li> <li> <div class="finnish6 bool">40</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/09-08-2026.html">NG&Agrave;Y: 09/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01547</span> | Ng&agrave;y quay thưởng 09/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">03</div></li> <li> <div class="finnish2 bool">17</div></li> <li> <div class="finnish3 bool">20</div></li> <li> <div class="finnish4 bool">27</div></li> <li> <div class="finnish5 bool">31</div></li> <li> <div class="finnish6 bool">35</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/07-08-2026.html">NG&Agrave;Y: 07/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01546</span> | Ng&agrave;y quay thưởng 07/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">02</div></li> <li> <div class="finnish2 bool">08</div></li> <li> <div class="finnish3 bool">19</div></li> <li> <div class="finnish4 bool">30</div></li> <li> <div class="finnish5 bool">36</div></li> <li> <div class="finnish6 bool">43</div></li> </ul></div>
<div class="boxkqxsdientoan"><h4><a href="/ket-qua-xo-so/dien-toan-vietlott/mega-6x45/05-08-2026.html">NG&Agrave;Y: 05/08/2026</a></h4><td align="center">Kỳ vé: <span id="DT6X45_KY_VE">#01545</span> | Ng&agrave;y quay thưởng 05/08/2026</td> </tr> </tbody> </table> <!--Kỳ quay thưởng [KYQUAY] | --> </p> <ul class="result-number"> <li> <div class="finnish1 bool">02</div></li> <li> <div class="finnish2 bool">06</div></li> <li> <div class="finnish3 bool">11</div></li> <li> <div class="finnish4 bool">16</div></li> <li> <div class="finnish5 bool">28</div></li> <li> <div class="finnish6 bool">39</div></li> </ul></div>
`;

/** 18 kỳ Power 6/55 thật (11/08/2026 → 19/09/2026), markup nguyên bản của nguồn. */
const POWER_HTML = `
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/19-09-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">04</div></li> <li> <div class="finnish2 bool">07</div></li> <li> <div class="finnish3 bool">11</div></li> <li> <div class="finnish4 bool">18</div></li> <li> <div class="finnish5 bool">22</div></li> <li> <div class="finnish6 bool">25</div></li> <li class="number_special"> <div class="finnish7 bool">50</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/17-09-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">06</div></li> <li> <div class="finnish2 bool">11</div></li> <li> <div class="finnish3 bool">25</div></li> <li> <div class="finnish4 bool">27</div></li> <li> <div class="finnish5 bool">37</div></li> <li> <div class="finnish6 bool">45</div></li> <li class="number_special"> <div class="finnish7 bool">15</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/15-09-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">24</div></li> <li> <div class="finnish2 bool">27</div></li> <li> <div class="finnish3 bool">32</div></li> <li> <div class="finnish4 bool">36</div></li> <li> <div class="finnish5 bool">38</div></li> <li> <div class="finnish6 bool">47</div></li> <li class="number_special"> <div class="finnish7 bool">52</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/12-09-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">07</div></li> <li> <div class="finnish2 bool">24</div></li> <li> <div class="finnish3 bool">31</div></li> <li> <div class="finnish4 bool">43</div></li> <li> <div class="finnish5 bool">47</div></li> <li> <div class="finnish6 bool">54</div></li> <li class="number_special"> <div class="finnish7 bool">22</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/10-09-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">02</div></li> <li> <div class="finnish2 bool">05</div></li> <li> <div class="finnish3 bool">28</div></li> <li> <div class="finnish4 bool">32</div></li> <li> <div class="finnish5 bool">51</div></li> <li> <div class="finnish6 bool">53</div></li> <li class="number_special"> <div class="finnish7 bool">50</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/08-09-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">08</div></li> <li> <div class="finnish2 bool">11</div></li> <li> <div class="finnish3 bool">14</div></li> <li> <div class="finnish4 bool">23</div></li> <li> <div class="finnish5 bool">25</div></li> <li> <div class="finnish6 bool">54</div></li> <li class="number_special"> <div class="finnish7 bool">17</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/05-09-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">09</div></li> <li> <div class="finnish2 bool">11</div></li> <li> <div class="finnish3 bool">24</div></li> <li> <div class="finnish4 bool">31</div></li> <li> <div class="finnish5 bool">33</div></li> <li> <div class="finnish6 bool">47</div></li> <li class="number_special"> <div class="finnish7 bool">21</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/03-09-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">08</div></li> <li> <div class="finnish2 bool">09</div></li> <li> <div class="finnish3 bool">16</div></li> <li> <div class="finnish4 bool">42</div></li> <li> <div class="finnish5 bool">46</div></li> <li> <div class="finnish6 bool">47</div></li> <li class="number_special"> <div class="finnish7 bool">11</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/01-09-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">01</div></li> <li> <div class="finnish2 bool">17</div></li> <li> <div class="finnish3 bool">41</div></li> <li> <div class="finnish4 bool">44</div></li> <li> <div class="finnish5 bool">49</div></li> <li> <div class="finnish6 bool">55</div></li> <li class="number_special"> <div class="finnish7 bool">45</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/29-08-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">05</div></li> <li> <div class="finnish2 bool">10</div></li> <li> <div class="finnish3 bool">15</div></li> <li> <div class="finnish4 bool">29</div></li> <li> <div class="finnish5 bool">34</div></li> <li> <div class="finnish6 bool">45</div></li> <li class="number_special"> <div class="finnish7 bool">24</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/27-08-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">01</div></li> <li> <div class="finnish2 bool">03</div></li> <li> <div class="finnish3 bool">11</div></li> <li> <div class="finnish4 bool">21</div></li> <li> <div class="finnish5 bool">26</div></li> <li> <div class="finnish6 bool">44</div></li> <li class="number_special"> <div class="finnish7 bool">10</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/25-08-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">05</div></li> <li> <div class="finnish2 bool">07</div></li> <li> <div class="finnish3 bool">13</div></li> <li> <div class="finnish4 bool">18</div></li> <li> <div class="finnish5 bool">31</div></li> <li> <div class="finnish6 bool">40</div></li> <li class="number_special"> <div class="finnish7 bool">14</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/22-08-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">09</div></li> <li> <div class="finnish2 bool">18</div></li> <li> <div class="finnish3 bool">19</div></li> <li> <div class="finnish4 bool">21</div></li> <li> <div class="finnish5 bool">25</div></li> <li> <div class="finnish6 bool">36</div></li> <li class="number_special"> <div class="finnish7 bool">08</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/20-08-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">02</div></li> <li> <div class="finnish2 bool">08</div></li> <li> <div class="finnish3 bool">29</div></li> <li> <div class="finnish4 bool">38</div></li> <li> <div class="finnish5 bool">39</div></li> <li> <div class="finnish6 bool">51</div></li> <li class="number_special"> <div class="finnish7 bool">47</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/18-08-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">03</div></li> <li> <div class="finnish2 bool">15</div></li> <li> <div class="finnish3 bool">18</div></li> <li> <div class="finnish4 bool">38</div></li> <li> <div class="finnish5 bool">41</div></li> <li> <div class="finnish6 bool">48</div></li> <li class="number_special"> <div class="finnish7 bool">30</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/15-08-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">16</div></li> <li> <div class="finnish2 bool">20</div></li> <li> <div class="finnish3 bool">25</div></li> <li> <div class="finnish4 bool">27</div></li> <li> <div class="finnish5 bool">30</div></li> <li> <div class="finnish6 bool">50</div></li> <li class="number_special"> <div class="finnish7 bool">02</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/13-08-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">05</div></li> <li> <div class="finnish2 bool">09</div></li> <li> <div class="finnish3 bool">27</div></li> <li> <div class="finnish4 bool">29</div></li> <li> <div class="finnish5 bool">45</div></li> <li> <div class="finnish6 bool">46</div></li> <li class="number_special"> <div class="finnish7 bool">42</div></li> </ul></div></div>
<div class="bangkq6x36 bangkq6x55"><div class="title"><a class="viewmore" href=" /xo-so-dien-toan/power-6x55/11-08-2026.html " target="_blank">Xem thêm</a></div><div class="box-result-detail"><ul class="result-number"> <li> <div class="finnish1 bool">02</div></li> <li> <div class="finnish2 bool">07</div></li> <li> <div class="finnish3 bool">19</div></li> <li> <div class="finnish4 bool">20</div></li> <li> <div class="finnish5 bool">39</div></li> <li> <div class="finnish6 bool">50</div></li> <li class="number_special"> <div class="finnish7 bool">31</div></li> </ul></div></div>
`;

const MEGA = vl.parseDraws(MEGA_HTML, { game: "mega645" });
const POWER = vl.parseDraws(POWER_HTML, { game: "power655" });

test("parse kỳ quay THẬT của Mega 6/45 từ HTML nguồn", () => {
  assert.equal(MEGA.length, 21, "phải parse đủ 21 kỳ có trong fixture");
  assert.equal(MEGA[0].date, "2026-08-05", "sắp CŨ → MỚI");
  assert.equal(MEGA.at(-1).date, "2026-09-20");
  assert.deepEqual(MEGA.at(-1).numbers, [10, 15, 16, 27, 33, 38], "kỳ #01565 ngày 20/09/2026");
  assert.equal(MEGA.at(-1).id, "#01565", "mã kỳ vé lấy từ trang nguồn");
  assert.equal(MEGA.at(-1).special, null, "Mega 6/45 không có bóng đặc biệt");
  for (const draw of MEGA) {
    assert.match(draw.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(draw.numbers.length, 6, "mỗi kỳ đúng 6 số");
    assert.equal(new Set(draw.numbers).size, 6, "không trùng số trong một kỳ");
    assert.ok(draw.numbers.every((n) => n >= 1 && n <= 45), "số nằm trong dải 1–45");
    assert.deepEqual([...draw.numbers].sort((a, b) => a - b), draw.numbers, "số đã sắp tăng dần");
  }
});

test("parse kỳ quay THẬT của Power 6/55: 6 số chính + bóng đặc biệt", () => {
  assert.equal(POWER.length, 18, "phải parse đủ 18 kỳ có trong fixture");
  assert.equal(POWER[0].date, "2026-08-11");
  assert.equal(POWER.at(-1).date, "2026-09-19");
  assert.deepEqual(POWER.at(-1).numbers, [4, 7, 11, 18, 22, 25]);
  assert.equal(POWER.at(-1).special, 50, "bóng Power là số thứ 7 của kỳ đó");
  for (const draw of POWER) {
    assert.equal(draw.numbers.length, 6);
    assert.ok(draw.special >= 1 && draw.special <= 55, "bóng Power trong dải 1–55");
    assert.ok(!draw.numbers.includes(draw.special), "bóng đặc biệt không trùng 6 số chính");
    assert.ok(draw.numbers.every((n) => n >= 1 && n <= 55));
  }
});

test("dòng hỏng (trùng số, ngoài dải, thiếu số) bị bỏ, không làm sai dữ liệu", () => {
  const html = [
    '<h4><a href="/x/20-09-2026.html">NGÀY: 20/09/2026</a></h4><ul class="result-number">',
    '<li><div class="finnish1 bool">05</div></li><li><div class="finnish2 bool">05</div></li>',
    '<li><div class="finnish3 bool">11</div></li><li><div class="finnish4 bool">22</div></li>',
    '<li><div class="finnish5 bool">33</div></li><li><div class="finnish6 bool">44</div></li></ul>',
    '<h4><a href="/x/18-09-2026.html">NGÀY: 18/09/2026</a></h4><ul class="result-number">',
    '<li><div class="finnish1 bool">01</div></li><li><div class="finnish2 bool">02</div></li>',
    '<li><div class="finnish3 bool">03</div></li><li><div class="finnish4 bool">04</div></li>',
    '<li><div class="finnish5 bool">05</div></li><li><div class="finnish6 bool">99</div></li></ul>',
    '<h4><a href="/x/16-09-2026.html">NGÀY: 16/09/2026</a></h4><ul class="result-number">',
    '<li><div class="finnish1 bool">07</div></li><li><div class="finnish2 bool">12</div></li>',
    '<li><div class="finnish3 bool">19</div></li><li><div class="finnish4 bool">27</div></li>',
    '<li><div class="finnish5 bool">31</div></li><li><div class="finnish6 bool">40</div></li></ul>',
  ].join("");
  const draws = vl.parseDraws(html, { game: "mega645" });
  assert.equal(draws.length, 1, "chỉ giữ kỳ hợp lệ");
  assert.equal(draws[0].date, "2026-09-16");
  assert.deepEqual(draws[0].numbers, [7, 12, 19, 27, 31, 40]);

  const report = vl.parseDrawsDetailed(html, { game: "mega645" });
  assert.equal(report.skipped, 2, "đếm được 2 dòng bị bỏ (trùng số và số 99 ngoài dải)");
});

test("parse JSON cùng dữ liệu thật cho kết quả giống nhánh HTML", () => {
  const json = JSON.stringify([
    { drawDate: "20/09/2026", result: "10 15 16 27 33 38", ky: "01565" },
    { drawDate: "18/09/2026", result: [7, 12, 26, 27, 41, 43] },
    { drawDate: "17/09/2026", result: "6 11 25 27 37 45", power: 15 },
  ]);
  const mega = vl.parseDraws(json, { game: "mega645" });
  assert.equal(mega.length, 2, "kỳ có bóng Power bị coi là sai dải với Mega 6/45 ⇒ bỏ");
  assert.deepEqual(mega.at(-1).numbers, [10, 15, 16, 27, 33, 38]);

  const power = vl.parseDraws(json, { game: "power655" });
  assert.equal(power.length, 3);
  const withPower = power.find((draw) => draw.date === "2026-09-17");
  assert.equal(withPower.special, 15, "bóng Power đọc từ trường `power`");
  assert.deepEqual(withPower.numbers, [6, 11, 25, 27, 37, 45]);
  assert.equal(power.filter((draw) => draw.special !== null).length, 1, "chỉ kỳ có trường `power` mới có bóng");
});

test("frequency: đếm đúng số lần xuất hiện trên dữ liệu thật", () => {
  const freq = vl.frequency(MEGA, { numbers: 45 });
  assert.equal(freq.length, 45, "trả đủ 45 số của Mega 6/45");
  assert.equal(freq.reduce((total, row) => total + row.count, 0), 21 * 6, "tổng lượt = số kỳ × 6");
  assert.equal(freq.find((row) => row.number === 27).count, 6, "27 về 6 lần trong 21 kỳ fixture");
  assert.equal(freq.find((row) => row.number === 5).count, 0, "05 không về lần nào trong fixture");
  assert.equal(freq[0].count, 6, "số về nhiều nhất đứng đầu");
  for (let i = 1; i < freq.length; i += 1) assert.ok(freq[i - 1].count >= freq[i].count, "sắp giảm dần");

  const window5 = vl.frequency(MEGA, { numbers: 45, window: 5 });
  assert.equal(window5.reduce((total, row) => total + row.count, 0), 5 * 6, "cửa sổ 5 kỳ ⇒ chỉ đếm 5 kỳ gần nhất");
});

test("gaps: số vừa về = 0, số chưa về lần nào = tổng số kỳ", () => {
  const gaps = vl.gaps(MEGA);
  assert.equal(gaps.length, 45);
  assert.equal(gaps.find((row) => row.number === 38).gap, 0, "38 có trong kỳ mới nhất 20/09/2026");
  assert.equal(gaps.find((row) => row.number === 27).gap, 0);
  assert.equal(gaps.find((row) => row.number === 5).gap, 21, "05 chưa về lần nào trong 21 kỳ");
  assert.deepEqual(
    gaps.filter((row) => row.lastDate === null).map((row) => row.number).sort((a, b) => a - b),
    [5, 24, 25, 42],
  );
  for (let i = 1; i < gaps.length; i += 1) assert.ok(gaps[i - 1].gap >= gaps[i].gap, "sắp giảm dần theo số kỳ chưa về");
});

test("pairs: cặp số về cùng nhau (a < b, sắp giảm dần)", () => {
  const top = vl.pairs(MEGA, { limit: 5 });
  assert.equal(top.length, 5);
  for (const row of top) {
    assert.ok(row.a < row.b, "cặp luôn ghi a < b");
    assert.ok(row.count >= 1);
    assert.ok(row.a >= 1 && row.b <= 45);
  }
  for (let i = 1; i < top.length; i += 1) assert.ok(top[i - 1].count >= top[i].count);
});

test("distribution: chẵn/lẻ, thấp/cao, tổng — số liệu khớp fixture", () => {
  const dist = vl.distribution(MEGA);
  assert.equal(dist.draws, 21);
  assert.equal(dist.max, 45);
  assert.equal(dist.evenOdd.even, 55);
  assert.equal(dist.evenOdd.odd, 71);
  assert.equal(dist.evenOdd.even + dist.evenOdd.odd, 21 * 6);
  assert.equal(dist.lowHigh.threshold, 22);
  assert.equal(dist.lowHigh.low, 67);
  assert.equal(dist.lowHigh.low + dist.lowHigh.high, 21 * 6);
  assert.equal(dist.sum.min, 66);
  assert.equal(dist.sum.max, 190);
  assert.deepEqual(dist.sum.band, [126, 155], "khoảng phổ biến p25–p75 của 21 kỳ");
  assert.ok(dist.sum.avg >= dist.sum.min && dist.sum.avg <= dist.sum.max);
  assert.equal(dist.bands.length, 3, "3 dải số đều nhau");
  assert.equal(dist.bands.reduce((total, band) => total + band.count, 0), 21 * 6);
});

test("suggestTickets: đúng số vé, đúng 6 số/vé, không trùng, trong dải, TẤT ĐỊNH", () => {
  const first = vl.suggestTickets(MEGA, { count: 3 });
  const again = vl.suggestTickets(MEGA, { count: 3 });
  assert.deepEqual(first, again, "cùng dữ liệu ⇒ cùng vé (không random mỗi lần gọi)");
  assert.deepEqual(vl.suggestTickets(MEGA, { count: 3, seed: 2026 }), vl.suggestTickets(MEGA, { count: 3, seed: 2026 }));

  assert.equal(first.length, 3);
  const keys = new Set();
  for (const ticket of first) {
    assert.equal(ticket.numbers.length, 6);
    assert.equal(new Set(ticket.numbers).size, 6, "không trùng số trong một vé");
    assert.ok(ticket.numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45), "không vượt dải 1–45");
    assert.deepEqual([...ticket.numbers].sort((a, b) => a - b), ticket.numbers, "số đã sắp tăng dần");
    assert.equal(ticket.special, null, "Mega 6/45 không có bóng đặc biệt");
    keys.add(ticket.numbers.join("-"));
  }
  assert.equal(keys.size, 3, "3 vé khác nhau");

  const five = vl.suggestTickets(MEGA, { count: 5 });
  assert.equal(five.length, 5);
  assert.equal(new Set(five.map((ticket) => ticket.numbers.join("-"))).size, 5);
});

test("suggestTickets: trải đều 3 dải, không 3 số liên tiếp, tổng trong khoảng phổ biến, có lý do", () => {
  const dist = vl.distribution(MEGA);
  const [bandLow, bandHigh] = dist.sum.band;
  const tickets = vl.suggestTickets(MEGA, { count: 3 });
  for (const ticket of tickets) {
    const bandsHit = dist.bands.filter((band) => ticket.numbers.some((n) => n >= band.from && n <= band.to));
    assert.equal(bandsHit.length, 3, "mỗi vé có số ở cả 3 dải");
    const sorted = ticket.numbers;
    for (let i = 0; i + 2 < sorted.length; i += 1) {
      assert.ok(!(sorted[i] + 1 === sorted[i + 1] && sorted[i + 1] + 1 === sorted[i + 2]), "không có 3 số liên tiếp");
    }
    assert.ok(ticket.sum >= bandLow && ticket.sum <= bandHigh, `tổng ${ticket.sum} phải trong khoảng ${bandLow}–${bandHigh}`);
    assert.match(ticket.reason, /số về nhiều trong \d+ kỳ gần nhất/);
    assert.match(ticket.reason, /số lâu chưa về/);
    assert.match(ticket.reason, /trải đều 3\/3 dải/);
    assert.match(ticket.reason, new RegExp(`tổng ${ticket.sum} nằm trong khoảng phổ biến ${bandLow}–${bandHigh}`));
    // Lý do phải trung thực: không hứa hẹn, không "dễ trúng".
    assert.doesNotMatch(ticket.reason, /dễ trúng|chắc trúng|tăng khả năng trúng|đảm bảo/i);
  }
});

test("suggestTickets: Power 6/55 có bóng đặc biệt riêng cho từng vé", () => {
  const tickets = vl.suggestTickets(POWER, { count: 3 });
  assert.equal(tickets.length, 3);
  const specials = tickets.map((ticket) => ticket.special);
  for (const ticket of tickets) {
    assert.ok(ticket.special >= 1 && ticket.special <= 55);
    assert.ok(!ticket.numbers.includes(ticket.special));
    assert.match(ticket.reason, /Bóng Power \d{2}: \d+ kỳ chưa ra/);
  }
  assert.equal(new Set(specials).size, 3, "mỗi vé một bóng Power khác nhau");
});

test("suggestTickets: không có dữ liệu ⇒ không bịa vé nào", () => {
  assert.deepEqual(vl.suggestTickets([], { count: 3 }), []);
  assert.deepEqual(vl.suggestTickets(null, { count: 3 }), []);
});

test("công cụ `vietlott` có trong danh sách công cụ, schema đúng khuôn", () => {
  const tool = skills.TOOL_DEFINITIONS.find((row) => row.name === "vietlott");
  assert.ok(tool, "tool vietlott phải được đăng ký");
  assert.equal(tool.skill, "auto");
  assert.equal(tool.inputSchema.type, "object");
  assert.deepEqual(tool.inputSchema.required, ["game"]);
  assert.deepEqual(tool.inputSchema.properties.game.enum, ["mega645", "power655"]);
  assert.match(tool.description, /KHÔNG dự đoán kết quả/);
  assert.equal(typeof tool.handler, "function");
});

test("công cụ `vietlott` chưa rõ game ⇒ hỏi lại, KHÔNG đoán số", async () => {
  const result = await skills.executeTool("vietlott", {}, { userMessage: "chọn giúp em mấy con số may mắn" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "game_required");
  assert.match(result.modelText, /KHÔNG tự chọn hộ/);
  assert.equal(result.data.tickets, undefined, "không có vé nào khi chưa lấy được dữ liệu");
});

test("khối miễn trừ do SERVER soạn: đủ xác suất thật, nói rõ không tăng xác suất trúng", () => {
  const block = formatVietlottDisclaimer();
  assert.match(block, /Miễn trừ trách nhiệm — Vietlott/);
  assert.match(block, /ngẫu nhiên/);
  assert.match(block, /độc lập nhau/);
  assert.match(block, /KHÔNG PHẢI DỰ ĐOÁN KẾT QUẢ/);
  assert.match(block, /không làm tăng xác suất trúng/);
  assert.match(block, /Mega 6\/45 là 1\/8\.145\.060/);
  assert.match(block, /Power 6\/55 là 1\/28\.989\.675/);
  assert.match(block, /Chơi có trách nhiệm/);
  assert.match(block, /không dùng tiền ảnh hưởng tới sinh hoạt/);
});

test("từ khoá quyết định gắn khối miễn trừ, không lấn sang chủ đề khác", () => {
  for (const question of [
    "Vietlott hôm nay có gì mới?",
    "Nên chọn số Mega 6/45 thế nào?",
    "Phân tích Power 6/55 giúp em",
    "Xổ số điện toán hôm nay ra số nào?",
    "Max 4D chọn số sao anh?",
  ]) {
    assert.equal(vl.vietlottQuestionLikely(question), true, question);
  }
  for (const question of [
    "Giải thích MCP là gì trong 5 dòng",
    "Làm slide 8 trang giới thiệu sản phẩm",
    "Xổ số miền Bắc hôm nay có kết quả chưa?",
    "Giá vàng hôm nay bao nhiêu?",
  ]) {
    assert.equal(vl.vietlottQuestionLikely(question), false, question);
  }
});

/**
 * Gateway OpenAI-compatible giả: ghi lại system prompt fBuddy gửi đi rồi trả một câu cố định
 * (không gọi công cụ), để kiểm tra đúng nhánh "câu hỏi khớp từ khoá" của khối miễn trừ.
 */
async function startStubGateway() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
      seen.push({
        system: (body.messages ?? []).find((message) => message.role === "system")?.content ?? "",
        tools: (body.tools ?? []).map((tool) => tool.function?.name ?? tool.name),
      });
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const chunk of [
        { choices: [{ delta: { content: "Dạ " } }] },
        { choices: [{ delta: { content: "em gợi ý theo thống kê ạ." } }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 4 } },
      ]) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}/v1`, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("lượt chat về Vietlott ⇒ câu trả lời được LƯU kèm khối miễn trừ; chủ đề khác thì không", async (t) => {
  // Tra cứu trước đặt timeout 1ms: test này không được phụ thuộc mạng ngoài.
  process.env.RESEARCH_TIMEOUT_MS = "1";
  const gateway = await startStubGateway();
  t.after(() => gateway.close());

  const { token } = await registerAdmin("vietlott-e2e@fbuddy.test");
  const provider = settings.createProvider({
    kind: "openai",
    name: "Stub gateway",
    baseUrl: gateway.baseUrl,
    apiKey: "stub-key-0123456789",
    models: ["stub-1"],
    enabled: true,
  });
  settings.patchAppSettings({ defaultProviderId: provider.id, defaultModel: "stub-1", creditsEnabled: false });

  // (1) câu hỏi về Vietlott ⇒ có khối miễn trừ, và system prompt có luật Vietlott.
  const asked = await chat({ token, content: "Em nên chọn số Vietlott Mega 6/45 thế nào?", skill: "chat" });
  const answer = textOf(asked);
  assert.match(answer, /Miễn trừ trách nhiệm — Vietlott/);
  assert.match(answer, /1\/8\.145\.060/);
  assert.match(answer, /1\/28\.989\.675/);
  assert.match(answer, /không làm tăng xác suất trúng/);
  assert.match(gateway.seen[0].system, /VIETLOTT \(bắt buộc trung thực\)/);
  assert.ok(gateway.seen[0].tools.includes("vietlott"), "model phải được cấp công cụ vietlott");
  assert.doesNotMatch(answer, /dễ trúng|chắc trúng/i);

  // (2) chủ đề khác ⇒ KHÔNG được chèn khối miễn trừ vào câu trả lời.
  const other = await chat({ token, content: "Giải thích MCP là gì trong 5 dòng", skill: "chat" });
  const otherAnswer = textOf(other);
  assert.doesNotMatch(otherAnswer, /Miễn trừ trách nhiệm/);
  assert.doesNotMatch(otherAnswer, /1\/8\.145\.060/);
  assert.doesNotMatch(gateway.seen[1].system, /VIETLOTT \(bắt buộc trung thực\)/);
});
