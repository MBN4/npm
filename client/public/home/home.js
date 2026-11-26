'use strict';
// Naveed Medical Complex landing page. Hash routes: #home, #clinic, #blood, #study.
// The pharmacy website lives at /pharmacy/ and the admin panel at /admin/.
(function(){
  const app=document.getElementById('app');

  const btn=(href,label,css)=>'<a class="button'+(css?' '+css:'')+'" href="'+href+'">'+label+'</a>';
  const card=(icon,title,body,href,label,css)=>
    '<article class="card'+(css==='blood'?' is-blood':'')+'"><div class="icon" aria-hidden="true">'+icon+'</div><h2>'+title+'</h2><p>'+body+'</p>'+(href?btn(href,label,css):'<span class="badge">Coming soon</span>')+'</article>';
  const back='<a class="back" href="#home">← Naveed Medical Complex</a>';
  const comingSoon=(icon,kicker,title,desc,items,extra)=>
    back+'<section class="soon"><div class="icon" aria-hidden="true">'+icon+'</div><span class="badge">Coming soon</span>'+
    '<div class="kicker page-kicker" style="margin-top:16px">'+kicker+'</div><h1 tabindex="-1">'+title+'</h1><p>'+desc+'</p>'+
    (items.length?'<ul>'+items.map(i=>'<li>'+i+'</li>').join('')+'</ul>':'')+
    (extra||btn('#home','Back to home','ghost'))+'</section>';

  const pages={
    home:()=>
      '<section class="hero"><div class="kicker">Islampura · Lahore</div><h1 tabindex="-1">Naveed Medical<br>Complex</h1>'+
      '<p>Find your pharmacy, clinic and welfare services in one place.</p>'+
      '<a class="button" style="background:var(--lime);color:#14332a" href="/pharmacy/">Visit the pharmacy →</a></section>'+
      '<div class="cards">'+
        card('💊','Pharmacy','Browse OTC and prescription medicines, explore medicine information and check out as a guest.','/pharmacy/','Explore Pharmacy')+
        card('🩺','Clinic','Doctor profiles, clinic timings and appointment booking are on the way.','#clinic','Explore Clinic')+
        card('🩸','Blood Donor Portal','Naveed Medical Welfare will connect blood requests with registered donors.','#blood','Open Blood Portal','blood')+
        card('📚','Study Pharmacology','Abdul’s Pharma lessons, illustrated story and quizzes for health sciences students.','#study','Start Studying')+
      '</div>'+
      '<div class="strip"><div><b>Since 1994</b>Serving Islampura, Lahore</div><div><b>Pharmacy</b>OTC, prescription and multivitamins</div><div><b>Welfare</b>Blood donor coordination</div></div>',

    clinic:()=>comingSoon('🩺','Naveed Medical Clinic','Clinic',
      'We are preparing the clinic section. Doctor profiles, timings and online appointments will be available here soon.',
      ['Doctor profiles','Clinic timings','Appointment booking','Consultation fees'],
      btn('/pharmacy/','Visit the pharmacy meanwhile')),

    blood:()=>back+
      '<div class="kicker page-kicker">Naveed Medical Welfare</div><h1 tabindex="-1">Blood Donor Portal</h1>'+
      '<p class="lead">Donor coordination for patients in need. The welfare team reviews every request and contacts opted-in donors manually.</p>'+
      '<p class="banner">The Blood Donor Portal is being set up. Requests and donor registration will open here soon.</p>'+
      '<div class="cards">'+
        card('🆘','Request blood','Enter the required blood group, hospital or blood bank and a callback number for the welfare team.')+
        card('🙋','Become a donor','Register as a donor and choose whether the welfare team may contact you when your blood group is needed.')+
        card('🏕️','Blood camps','Upcoming donation camps and camp registration from the welfare team.')+
      '</div>',

    study:()=>back+
      '<div class="kicker page-kicker">Abdul’s Pharma</div><h1 tabindex="-1">Study Pharmacology</h1>'+
      '<p class="lead">Medicine guides, drug interaction infographics and learning resources for health sciences students and professionals.</p>'+
      '<div class="cards">'+
        card('📖','Illustrated story','Follow one pharmacist from the first pharmacology class to the lab, production line and the medicine’s journey through the body.','/pharmacy/#journey','Read the story')+
        card('🎓','Student portal','Request access, then sign in once the pharmacy team approves your details.','/pharmacy/#academy','Open student portal')+
        card('🧠','Medicine explorer','Turn a medicine pack, reveal the tablet and explore its medicine mind map.','/pharmacy/#explore','Explore a medicine')+
      '</div>'
  };

  function render(){
    let route=location.hash.slice(1)||'home';
    if(!pages[route])route='home';
    app.innerHTML=pages[route]();
    document.querySelectorAll('nav [data-route]').forEach(a=>{
      if(a.dataset.route===route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
    const titles={home:'Naveed Medical Complex | Islampura, Lahore',clinic:'Clinic | Naveed Medical Complex',blood:'Blood Donor Portal | Naveed Medical Complex',study:'Study Pharmacology | Naveed Medical Complex'};
    document.title=titles[route];
  }

  window.addEventListener('hashchange',()=>{
    render();
    window.scrollTo(0,0);
    app.querySelector('h1')?.focus({preventScroll:true});
  });
  render();
})();
