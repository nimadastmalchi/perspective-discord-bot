const googleapis = require('googleapis');

require('dotenv').config();

// According to Perspective API's documentation, a text has a level of each attribute from 0-1. 
// The level of an attribute must exceed the below thresholds to trigger a response.
const attributeThresholds = {
  'INSULT': 0.75,
  'TOXICITY': 0.75,
  'SEVERE_TOXICITY' : 0.8,
  'THREAT':0.8,
  'INCOHERENT': 0.87,
  'SPAM': 0.7,
};
module.exports.attributeThresholds = attributeThresholds;

// From perspective API's documentation:
/*
In order to analyze a text:
  Following object needs to be iniallized:
  {}

Example of the result the API outputs for a given text:
result:
{
  "attributeScores": {
    "TOXICITY": {
      "spanScores": [
        {
          "score": {
            "value": 0.4445836,
            "type": "PROBABILITY"
          }
        }
      ],
      "summaryScore": {
        "value": 0.4445836,
        "type": "PROBABILITY"
      }
    }
  },
  "languages": [
    "en"
  ]
}
*/

// Param: The text to analyze through Prespective API
// Return: An array of two elements:
//         Element 0: attributeMap object of true/false
//         Element 1: scoreMap object of scores
async function analyzeText(text) {
  const analyzer = new googleapis.commentanalyzer_v1alpha1.Commentanalyzer();

  // requestedAttributes is initiallized with attributes as 2D object:
  const requestedAttributes = {};
  for (const attribute in attributeThresholds) {
    requestedAttributes[attribute] = {};
  }
  
  // The resource of analyzer.comments.analyze, which expects a comment, language, and requestedAttributes element.
  const resAnalyze = {
    comment: {text: text},
    languages: ['en'],
    requestedAttributes: requestedAttributes,
  };

  const result = await analyzer.comments.analyze({
    key: process.env.PERSPECTIVE_API_KEY,
    resource: resAnalyze},
  );

  // Creating a 2D object, data, with attributes as key and true/false as elements. 

  attributeMap = {};
  scoreMap = {};

  for (const attribute in result['data']['attributeScores']) {
    scoreMap[attribute] = result['data']['attributeScores'][attribute]['summaryScore']['value'];
    attributeMap[attribute] = scoreMap[attribute] > attributeThresholds[attribute];
    // data[key] is true if the attribute score is larger than attrbuteTreshold.
  }

  //console.log(scoreMap);

  return [attributeMap, scoreMap];
}

module.exports.analyzeText = analyzeText;