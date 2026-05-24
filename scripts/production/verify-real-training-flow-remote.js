/* eslint-disable no-console */
const fs = require('fs');
const { Client } = require('ssh2');

const VPS={host:'187.127.105.253',port:22,username:'root',password:'Abbasi@3155093759'};
const BLS='b721b5b7-bf9e-4c44-b89d-ede14a5e7bf7';
const EPI='3da8ba5f-1a6d-4de9-8de9-1f9db5cc32c4';

function exec(conn,cmd,timeout=120000){return new Promise((res,rej)=>{let out='',err='';conn.exec(cmd,(e,s)=>{if(e)return rej(e);const t=setTimeout(()=>rej(new Error('timeout')),timeout);s.on('close',code=>{clearTimeout(t);res({code,out:out.trim(),err:err.trim()});});s.on('data',d=>out+=d);s.stderr.on('data',d=>err+=d);});});}

(async()=>{
  const conn=new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect({...VPS,readyTimeout:20000}));
  const report={at:new Date().toISOString(),checks:[]};
  const add=(name,ok,detail)=>{report.checks.push({name,ok,detail}); if(!ok) throw new Error(name+': '+detail);};

  try {
    const loginCmd = `curl -s -X POST http://127.0.0.1/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"demo.learner@carelearn.local","password":"DemoLearner123!"}'`;
    const login = await exec(conn, loginCmd);
    const loginJson = JSON.parse(login.out || '{}');
    add('auth.login', Boolean(loginJson.token), login.out);
    const token = loginJson.token;

    const me = JSON.parse((await exec(conn, `curl -s http://127.0.0.1/api/v1/auth/me -H 'Authorization: Bearer ${token}'`)).out || '{}');
    add('auth.me', me.user?.email === 'demo.learner@carelearn.local', JSON.stringify(me));

    const courses = JSON.parse((await exec(conn, `curl -s http://127.0.0.1/api/v1/courses -H 'Authorization: Bearer ${token}'`)).out || '{}');
    const ids = new Set((courses.courses||[]).map(c=>c.id));
    add('courses.count', (courses.courses||[]).length===2, JSON.stringify(courses));
    add('courses.ids', ids.has(BLS)&&ids.has(EPI), JSON.stringify([...ids]));

    const enrs = JSON.parse((await exec(conn, `curl -s http://127.0.0.1/api/v1/enrollments/my -H 'Authorization: Bearer ${token}'`)).out || '{}');
    const blsEnroll = (enrs.enrollments||[]).find(e=>e.course_id===BLS);
    const epiEnroll = (enrs.enrollments||[]).find(e=>e.course_id===EPI);
    add('enrollments.bls', Boolean(blsEnroll), JSON.stringify(enrs));
    add('enrollments.epilepsy', Boolean(epiEnroll), JSON.stringify(enrs));

    const blsCourse = JSON.parse((await exec(conn, `curl -s http://127.0.0.1/api/v1/courses/${BLS} -H 'Authorization: Bearer ${token}'`)).out || '{}');
    const epiCourse = JSON.parse((await exec(conn, `curl -s http://127.0.0.1/api/v1/courses/${EPI} -H 'Authorization: Bearer ${token}'`)).out || '{}');
    const blsLessons = (blsCourse.course?.modules||[]).flatMap(m=>m.lessons||[]);
    const epiLessons = (epiCourse.course?.modules||[]).flatMap(m=>m.lessons||[]);
    add('lessons.bls', blsLessons.length>0, String(blsLessons.length));
    add('lessons.epilepsy', epiLessons.length>0, String(epiLessons.length));

    const blsImageOk = blsLessons.flatMap(l=>l.content?.blocks||[]).some(b=>String(b?.payload?.src||'').includes('/course-assets/bls/'));
    const epiImageOk = epiLessons.flatMap(l=>l.content?.blocks||[]).some(b=>String(b?.payload?.src||'').includes('/course-assets/epilepsy/'));
    add('images.bls.namespace', blsImageOk, 'missing /course-assets/bls');
    add('images.epilepsy.namespace', epiImageOk, 'missing /course-assets/epilepsy');

    const p1 = await exec(conn, `curl -s -X PUT http://127.0.0.1/api/v1/enrollments/progress -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '{"enrollment_id":"${blsEnroll.id}","lesson_id":"${blsLessons[0].id}","time_spent_seconds":91}'`);
    const p2 = await exec(conn, `curl -s -X PUT http://127.0.0.1/api/v1/enrollments/progress -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '{"enrollment_id":"${epiEnroll.id}","lesson_id":"${epiLessons[0].id}","time_spent_seconds":92}'`);
    add('progress.bls.update', (JSON.parse(p1.out||'{}').message)==='Progress updated', p1.out);
    add('progress.epi.update', (JSON.parse(p2.out||'{}').message)==='Progress updated', p2.out);
    for (const lesson of blsLessons.slice(1)) {
      const px = await exec(conn, `curl -s -X PUT http://127.0.0.1/api/v1/enrollments/progress -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '{"enrollment_id":"${blsEnroll.id}","lesson_id":"${lesson.id}","time_spent_seconds":75}'`);
      add(`progress.bls.full.${lesson.id}`, (JSON.parse(px.out||'{}').message)==='Progress updated', px.out);
    }

    const qs = JSON.parse((await exec(conn, `curl -s 'http://127.0.0.1/api/v1/courses/${BLS}/questions?is_final=true' -H 'Authorization: Bearer ${token}'`)).out || '{}').questions || [];
    add('assessment.questions', qs.length>0, String(qs.length));

    const failAnswers = qs.map(q=>({question_id:q.id,answer:Number(q.correct_answer)===0?1:0}));
    const passAnswers = qs.map(q=>({question_id:q.id,answer:Number(q.correct_answer)}));
    const fail = JSON.parse((await exec(conn, `curl -s -X POST http://127.0.0.1/api/v1/courses/${BLS}/attempt -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '${JSON.stringify({enrollment_id:blsEnroll.id,is_final:true,answers:failAnswers})}'`)).out || '{}');
    const pass = JSON.parse((await exec(conn, `curl -s -X POST http://127.0.0.1/api/v1/courses/${BLS}/attempt -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '${JSON.stringify({enrollment_id:blsEnroll.id,is_final:true,answers:passAnswers})}'`)).out || '{}');
    add('assessment.fail', fail.passed===false, JSON.stringify(fail));
    add('assessment.pass', pass.passed===true, JSON.stringify(pass));

    const complete = JSON.parse((await exec(conn, `curl -s -X POST http://127.0.0.1/api/v1/enrollments/complete -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '{"enrollment_id":"${blsEnroll.id}"}'`)).out || '{}');
    add('completion.bls', Boolean(complete.enrollment?.id), JSON.stringify(complete));

    const progRead = JSON.parse((await exec(conn, `curl -s http://127.0.0.1/api/v1/enrollments/${blsEnroll.id}/progress -H 'Authorization: Bearer ${token}'`)).out || '{}');
    add('progress.persistence', (progRead.progress||[]).length>0, JSON.stringify(progRead));

    const dbCheckCmd = `cd /root/carelearn-pro && docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres psql -U carelearn -d carelearn -P pager=off -c "SELECT COUNT(*) AS attempts FROM assessment_attempts WHERE enrollment_id='${blsEnroll.id}' AND is_final=true; SELECT status, COUNT(*) FROM enrollments WHERE user_id='${me.user.id}' GROUP BY status ORDER BY status;"`;
    const dbCheck = await exec(conn, dbCheckCmd);
    add('db.persistence', dbCheck.code===0, dbCheck.out || dbCheck.err);

    report.summary={demo_email:'demo.learner@carelearn.local',bls_score_fail:fail.score,bls_score_pass:pass.score,db:dbCheck.out};
    const out=`cleanup-reports/real-training-e2e-remote-${Date.now()}.json`;
    fs.writeFileSync(out, JSON.stringify(report,null,2));
    console.log('PASS '+out);
  } finally {
    conn.end();
  }
})().catch((e)=>{console.error('FATAL:',e.message);process.exit(1)});
