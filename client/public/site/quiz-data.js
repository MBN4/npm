'use strict';

// Rows contain prompt, three choices, hint and explanation.
const copy = {
 en: {
  ui:['Language','Pharma Journey Quiz','Question','Did you know?','Correct','Try that idea again on your next run','Next','See score','Score','Retry','Check order','Clear order','Selected order','Sample label','Brand','Strength','Active ingredient'],
  questions:[
   ['Which part of the sample carton identifies the active ingredient?',['Brand','Active ingredient','Strength'],'The brand is the product name.','The active ingredient is the substance responsible for the medicine’s effect.'],
   ['Which test measures the release of an ingredient from a tablet?',['Colour check','Carton count','Dissolution test'],'Think about what happens when the tablet meets a liquid.','A dissolution test measures ingredient release under defined test conditions.'],
   ['What should the quality team verify before releasing a batch?',['The batch meets specifications','The carton looks attractive','The brand is easy to say'],'A batch has measurable acceptance criteria.','Quality checks compare batch results with approved specifications.'],
   ['Tap the stages in order for this example of an oral tablet.',['Reaches a target','Ingredient is released','Absorbed into blood'],'Start with what happens to the ingredient in the tablet.','In this example, release comes first, then absorption into blood, then arrival at a target.'],
   ['What do these two sample labels share?',['Brand','Strength','Active ingredient'],'Look below each brand name.','Different brands can use the same active ingredient, even at different strengths.']
  ]
 },
 ur: {
  ui:['زبان','فارما جرنی کوئز','سوال','کیا آپ جانتے ہیں؟','درست','اگلی کوشش میں دوبارہ آزمائیں','اگلا','نتیجہ دیکھیں','نتیجہ','دوبارہ شروع کریں','ترتیب جانچیں','ترتیب صاف کریں','منتخب ترتیب','نمونہ لیبل','برانڈ','طاقت','فعال جزو'],
  questions:[
   ['نمونے کے ڈبے پر فعال جزو کہاں لکھا ہے؟',['برانڈ','فعال جزو','طاقت'],'برانڈ مصنوع کا نام ہے۔','فعال جزو وہ مادہ ہے جو دوا کا اثر پیدا کرتا ہے۔'],
   ['کون سا ٹیسٹ گولی سے جزو کے اخراج کو ناپتا ہے؟',['رنگ کی جانچ','ڈبوں کی گنتی','تحلیل کا ٹیسٹ'],'سوچیں جب گولی مائع سے ملتی ہے تو کیا ہوتا ہے۔','تحلیل کا ٹیسٹ مقررہ حالات میں گولی سے جزو کے اخراج کو ناپتا ہے۔'],
   ['بیچ جاری کرنے سے پہلے معیار کی ٹیم کیا جانچے؟',['بیچ مقررہ معیار پر پورا اترتا ہے','ڈبہ خوبصورت ہے','برانڈ بولنے میں آسان ہے'],'بیچ کی منظوری کے معیار قابلِ پیمائش ہوتے ہیں۔','معیار کی جانچ میں بیچ کے نتائج کا منظور شدہ معیار سے موازنہ کیا جاتا ہے۔'],
   ['منہ سے لی جانے والی اس گولی کے مراحل ترتیب سے منتخب کریں۔',['ہدف تک پہنچتا ہے','جزو خارج ہوتا ہے','خون میں جذب ہوتا ہے'],'دیکھیں کہ پہلے گولی کے اندر موجود جزو کے ساتھ کیا ہوتا ہے۔','اس مثال میں پہلے جزو خارج ہوتا ہے، پھر خون میں جذب ہوتا ہے، پھر ہدف تک پہنچتا ہے۔'],
   ['ان دو نمونہ لیبلز میں کیا مشترک ہے؟',['برانڈ','طاقت','فعال جزو'],'ہر برانڈ نام کے نیچے دیکھیں۔','مختلف برانڈز میں ایک ہی فعال جزو مختلف طاقتوں میں ہو سکتا ہے۔']
  ]
 },
 it: {
  ui:['Lingua','Quiz sul percorso del farmaco','Domanda','Lo sapevi?','Corretto','Riprova al prossimo tentativo','Avanti','Mostra il punteggio','Punteggio','Ricomincia','Verifica l’ordine','Azzera l’ordine','Ordine scelto','Etichetta di esempio','Marca','Dosaggio','Principio attivo'],
  questions:[
   ['Quale parte della confezione di esempio indica il principio attivo?',['Marca','Principio attivo','Dosaggio'],'La marca identifica il prodotto.','Il principio attivo è la sostanza responsabile dell’effetto del medicinale.'],
   ['Quale test misura il rilascio di un ingrediente da una compressa?',['Controllo del colore','Conteggio delle confezioni','Test di dissoluzione'],'Pensa a cosa accade quando la compressa entra in contatto con un liquido.','Il test di dissoluzione misura il rilascio in condizioni definite.'],
   ['Che cosa verifica il team qualità prima di rilasciare un lotto?',['Il lotto rispetta le specifiche','La confezione è attraente','La marca è facile da pronunciare'],'Per il lotto esistono criteri di accettazione misurabili.','I risultati del lotto vengono confrontati con le specifiche approvate.'],
   ['Seleziona nell’ordine le fasi di questo esempio di compressa orale.',['Raggiunge il bersaglio','Il principio attivo viene rilasciato','Viene assorbito nel sangue'],'Parti da ciò che accade al principio attivo nella compressa.','In questo esempio avvengono prima il rilascio, poi l’assorbimento nel sangue e infine l’arrivo al bersaglio.'],
   ['Che cosa hanno in comune queste due etichette di esempio?',['Marca','Dosaggio','Principio attivo'],'Guarda sotto il nome della marca.','Marche diverse possono contenere lo stesso principio attivo in dosaggi diversi.']
  ]
 },
 de: {
  ui:['Sprache','Quiz zum Weg eines Arzneimittels','Frage','Schon gewusst?','Richtig','Versuche es beim nächsten Durchlauf erneut','Weiter','Ergebnis anzeigen','Ergebnis','Neu starten','Reihenfolge prüfen','Reihenfolge löschen','Gewählte Reihenfolge','Beispieletikett','Marke','Wirkstärke','Wirkstoff'],
  questions:[
   ['Welche Angabe auf der Beispielpackung nennt den Wirkstoff?',['Marke','Wirkstoff','Wirkstärke'],'Die Marke benennt das Produkt.','Der Wirkstoff ist die Substanz, die für die Wirkung des Arzneimittels verantwortlich ist.'],
   ['Welche Prüfung misst die Freisetzung aus einer Tablette?',['Farbprüfung','Zählen der Packungen','Freisetzungsprüfung'],'Überlege, was passiert, wenn die Tablette mit Flüssigkeit in Kontakt kommt.','Die Freisetzungsprüfung misst die Wirkstofffreisetzung unter definierten Bedingungen.'],
   ['Was prüft das Qualitätsteam vor der Freigabe einer Charge?',['Die Charge entspricht den Spezifikationen','Die Packung sieht gut aus','Die Marke ist leicht auszusprechen'],'Für die Charge gibt es messbare Akzeptanzkriterien.','Die Ergebnisse der Charge werden mit den genehmigten Spezifikationen verglichen.'],
   ['Wähle die Schritte für diese Tablette zum Einnehmen in der richtigen Reihenfolge.',['Erreicht den Wirkort','Wirkstoff wird freigesetzt','Wird ins Blut aufgenommen'],'Beginne damit, was mit dem Wirkstoff in der Tablette geschieht.','In diesem Beispiel folgen auf die Freisetzung die Aufnahme ins Blut und dann das Erreichen des Wirkortes.'],
   ['Was haben die beiden Beispieletiketten gemeinsam?',['Marke','Wirkstärke','Wirkstoff'],'Schau unter die Markennamen.','Verschiedene Marken können denselben Wirkstoff in unterschiedlichen Wirkstärken enthalten.']
  ]
 },
 ar: {
  ui:['اللغة','اختبار رحلة الدواء','السؤال','هل تعلم؟','إجابة صحيحة','حاول مجددًا في الجولة التالية','التالي','عرض النتيجة','النتيجة','إعادة المحاولة','تحقق من الترتيب','امسح الترتيب','الترتيب المختار','ملصق توضيحي','العلامة التجارية','العيار','المادة الفعالة'],
  questions:[
   ['أي جزء من العبوة التوضيحية يحدد المادة الفعالة؟',['العلامة التجارية','المادة الفعالة','العيار'],'العلامة التجارية هي اسم المنتج.','المادة الفعالة هي المادة المسؤولة عن تأثير الدواء.'],
   ['أي اختبار يقيس تحرر المادة من القرص؟',['فحص اللون','عدّ العبوات','اختبار الذوبان'],'فكر فيما يحدث عندما يلامس القرص سائلًا.','يقيس اختبار الذوبان تحرر المادة من القرص في ظروف اختبار محددة.'],
   ['ما الذي يتحقق منه فريق الجودة قبل الإفراج عن الدفعة؟',['مطابقة الدفعة للمواصفات','جاذبية العبوة','سهولة نطق اسم العلامة التجارية'],'للدفعة معايير قبول قابلة للقياس.','تُقارن نتائج الدفعة بالمواصفات المعتمدة.'],
   ['اختر مراحل هذا المثال للقرص الفموي بالترتيب.',['الوصول إلى الهدف','تحرر المادة الفعالة','الامتصاص إلى الدم'],'ابدأ بما يحدث للمادة الفعالة داخل القرص.','في هذا المثال تتحرر المادة أولًا، ثم تُمتص إلى الدم، ثم تصل إلى الهدف.'],
   ['ما المشترك بين هذين الملصقين التوضيحيين؟',['العلامة التجارية','العيار','المادة الفعالة'],'انظر أسفل اسم كل علامة تجارية.','قد تحتوي علامات تجارية مختلفة على المادة الفعالة نفسها بعيارات مختلفة.']
  ]
 }
};
