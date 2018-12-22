import pnormaldist from "pnormaldist";
import pkg from "../package.json";

const VERSION = 2
const APISERVER = 'https://api.panlex.org'
const URLBASE = (VERSION === 2) ? APISERVER + '/v2' : APISERVER

let highScoreCache = {};

function wilsonScore(score, maxScore, confidence) {
  let z = pnormaldist(1 - (1 - confidence) / 2);
  let p = score / maxScore;
  let left = p + 1 / (2 * maxScore) * z**2;
  let right = z * Math.sqrt(p * (1 - p) / maxScore + z**2 / (4 * maxScore**2));
  let under = 1 + 1 / maxScore * z**2;
  return (left - right) / under;
}

function query(ep, params) {
  let url = URLBASE + ep
  return(fetch(url, {
    method: 'POST',
    headers: new Headers({
      'x-app-name': `${pkg.name}/${pkg.version}`,
      'content-type': 'application/json',
    }),
    body: JSON.stringify(params),
  })
  .then((response) => response.json()));
}

function getTranslations(txt, uidDe, uidAl, distance = 0) {
  let queryOne = {
    include: ['trans_quality', 'trans_txt', 'trans_langvar'],
    sort: 'trans_quality desc',
  };
  if (Array.prototype.every.call(txt, v => typeof v === 'number')) {
    queryOne.trans_expr = txt
  } else {
    queryOne.trans_txt = txt
    if (typeof uidDe === 'number') {
      queryOne.trans_langvar = uidDe
    } else {
      queryOne.trans_uid = uidDe
    }
  }
  if (typeof uidAl === 'number') {
    queryOne.langvar = uidAl
  } else {
    queryOne.uid = uidAl
  }
  let queryTwo = Object.assign({trans_distance: 2}, queryOne);
  switch (distance) {
    case 1:
      return(query('/expr', queryOne).then(responseData => responseData.result))
    case 2:
      return(query('/expr', queryTwo).then(responseData => responseData.result))
    default:
      return(query('/fallback', {requests: [
        {url: '/expr', query: queryOne},
        {url: '/expr', query: queryTwo},
      ]}).then(responseData => responseData.result))
  }
}

function getNormTranslations(txt, lvDe, lvAl, wilson = 0) {
  let lvPair = [parseInt(lvDe, 10), parseInt(lvAl, 10)].sort((a,b) => a - b);
  let p = !(highScoreCache[lvPair[0]] && highScoreCache[lvPair[0]][lvPair[1]]) ? getHighScores([lvPair]) : Promise.resolve();
  return(p.then(() => {
    return(getTranslations(txt, lvDe, lvAl, 1).then(r => {
      let highScore = highScoreCache[lvPair[0]][lvPair[1]];
      return(r.map(trn => Object.assign(trn, {
        norm_quality: wilsonScore(trn.trans_quality, highScore, wilson),
        high_score: highScore,
      })))
    }))
  }))
}

function getTransPath(exprDe, exprAl) {
  let queryParams = {
    trans_expr: exprDe,
    id: exprAl,
    include: 'trans_path',
    trans_distance: 2,
  };
  return(query('/expr', queryParams).then(responseData => responseData.result))
}

function getMultTranslations(txtArray, uidDe, uidAl) {
  return(
    getTranslations(txtArray, uidDe, uidAl).then(
      (result) => {
        let output = {};
        let txtNotFound = [];
        for (let txt of txtArray) {
          let trnList = result.filter(trn => (trn.trans_txt === txt || trn.trans_expr === txt));
          if (trnList.length) {
            output[txt] = trnList;
          } else {
            txtNotFound.push(txt);
          }
        }
        return([output, txtNotFound])
      }
    ).then(
      ([output, txtNotFound]) => {
        if (txtNotFound.length) {
          return(
            getTranslations(txtNotFound, uidDe, uidAl).then(
              (result) => {
                for (let txt of txtNotFound) {
                  output[txt] = result.filter(trn => (trn.trans_txt === txt || trn.trans_expr === txt));
                }
                return(output);
              }
            )
          )
        } else {
          return(output)
        }
      }
    )
  )
}

function getAllTranslations(uidDe, uidAl, byId = false) {
  return(
    query("/expr", typeof uidDe === 'number' ? {langvar: uidDe} : {uid: uidDe}).then(
      r => {
        let exprList = r.result.map(expr => byId ? expr.id : expr.txt);
        return(
          getMultTranslations(exprList, uidDe, uidAl)
        )
      }
    )
  )
}

function getHighScores(lvPairs) {
  let idParams = [];
  let uidParams = [];
  lvPairs.forEach(lvPair => {
    let idPair = [parseInt(lvPair[0], 10), parseInt(lvPair[1], 10)];
    if (!isNaN(idPair[0]) && !isNaN(idPair[1])) {
      idParams.push(idPair);
    } else {
      uidParams.push(lvPair);
    }
  })
  return(query("/langvar_pair", {ids: idParams, uids: uidParams}).then(r => {
    r.result.forEach(lvPair => {
      let langvars = [lvPair.langvar1, lvPair.langvar2].sort((a,b) => a - b);
      if (!highScoreCache[langvars[0]]) {highScoreCache[langvars[0]] = {}};
      highScoreCache[langvars[0]][langvars[1]] = lvPair.max_quality_d1;
    })
  }));
}

export { wilsonScore, query, getTranslations, getTransPath, getMultTranslations, getAllTranslations, getNormTranslations }