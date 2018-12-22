import React, { Component } from "react";
import "./App.css";
import { xml2js } from "xml-js";
import { query, getMultTranslations, getNormTranslations } from "./api";

const LOCALES = ["en", "id", "jv"];

const compressExprs = exprs => {
  let exSet = exprs.reduce((exObj, ex) => {
    exObj[ex.txt] = (exObj[ex.txt] || 0) + ex.score;
    return exObj;
  }, {});
  return Object.entries(exSet)
    .sort((a, b) => b[1] - a[1])
    .map(en => ({ txt: en[0], score: en[1] }));
};

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      meanings: [],
      lvMap: new Map()
    };
  }

  componentWillMount() {
    let meaningMap = new Map();
    let fetchPromises = LOCALES.map(locale =>
      fetch(`data/${locale}.xml`)
        .then(r => r.text())
        .then(r => {
          let data = xml2js(r, { compact: true });
          data.ldml.localeDisplayNames.languages.language.forEach(t => {
            if (!meaningMap.has(t._attributes["type"])) {
              meaningMap.set(t._attributes["type"], {});
            }
            meaningMap.get(t._attributes["type"])[locale] = [{ txt: t._text, score: 1 }];
          });
        })
    );

    Promise.all(fetchPromises).then(() => {
      let meanings = [...meaningMap.entries()].sort().map(([code, obj]) => {
        let newObj = {};
        LOCALES.forEach(
          locale => (newObj[locale] = obj[locale] || [{ txt: "", score: 0 }])
        );
        return { code: [{ txt: code }], ...newObj };
      });
      this.setState({ meanings });
    });

    getMultTranslations(LOCALES, "art-420", "art-274").then(r => {
      let uidMap = new Map(Object.entries(r).map(([l, t]) => [t[0].txt, l]));
      let lvMap = new Map();
      query("/langvar", { uid: [...uidMap.keys()] }).then(r => {
        r.result.forEach(lv => {
          lvMap.set(uidMap.get(lv.uid), lv.id);
        });
        this.setState({ lvMap });
      });
    });
  }

  translateColumn(toLocale) {
    let meanings = this.state.meanings;
    let lvMap = this.state.lvMap;
    let t = LOCALES.map(locale => {
      if (locale === toLocale) {
        return Promise.resolve();
      }
      let meaningMap = new Map(meanings.map((mn, i) => [mn[locale][0].txt, i]));
      return getNormTranslations(
        meanings.map(mn => mn[locale][0].txt).filter(txt => txt),
        lvMap.get(locale),
        lvMap.get(toLocale)
      ).then(r => {
        r.forEach(ex => {
          meanings[meaningMap.get(ex.trans_txt)][toLocale].push({
            txt: ex.txt,
            score: ex.norm_quality
          });
        });
      });
    });
    Promise.all(t).then(() => {
      meanings.forEach(mn => {
        mn[toLocale] = compressExprs(mn[toLocale]);
      });
      this.setState({ meanings });
    });
    // let transMap = new Map();
    // let toLv = this.state.lvMap.get(toLocale);
    // LOCALES.forEach(fromLocale => {
    //   if (fromLocale === toLocale) { return; }
    //   let fromTxts = Object.entries(this.state.meanings).map(([c, d]) => d[fromLocale]);
    //   let fromLv = this.state.lvMap.get(fromLocale);
    //   console.log(fromLv);
    //   getNormTranslations(fromTxts, fromLv, toLv).then(r => console.log(r));
    // })
  }

  render() {
    return (
      <div className="App">
        <table>
          <thead>
            <tr>
              <td>code</td>
              {LOCALES.map(l => (
                <td key={l}>
                  <button onClick={() => this.translateColumn(l)}>{l}</button>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {this.state.meanings.map((mn, i) => (
              <tr key={i}>
                <td>{mn.code[0].txt}</td>
                {LOCALES.map(l => (
                  <td key={l}>{mn[l] ? mn[l][0].txt : ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}

export default App;
