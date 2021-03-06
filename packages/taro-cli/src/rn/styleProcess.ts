import path from 'path'
import fs from 'fs-extra'
import postcss from 'postcss'
import chalk from 'chalk'
import pxtransform from 'postcss-pxtransform'
import transformCSS from 'css-to-react-native-transform'

import { StyleSheetValidation } from './StyleSheet/index'
import * as Util from '../util'
import * as npmProcess from '../util/npm'
import { FILE_PROCESSOR_MAP, processTypeEnum } from '../util/constants'
import stylelintConfig from '../config/rn-stylelint.json'

const DEVICE_RATIO = 'deviceRatio'

/**
 * @description 读取 css/scss/less 文件，预处理后，返回 css string
 * @param {string}filePath
 * @param {object} pluginsConfig
 * @returns {*}
 */
function loadStyle ({filePath, pluginsConfig}) {
  const fileExt = path.extname(filePath)
  const pluginName = FILE_PROCESSOR_MAP[fileExt]
  if (pluginName) {
    return npmProcess.callPlugin(pluginName, null, filePath, pluginsConfig[pluginName] || {})
      .then((item) => {
        return {
          css: item.css.toString(),
          filePath
        }
      }).catch((e) => {
        Util.printLog(processTypeEnum.ERROR, '样式预处理', filePath)
        console.log(e.stack)
      })
  }
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf-8', (err, content) => {
      if (err) {
        return reject(err)
      }
      resolve({
        css: content,
        filePath
      })
    })
  })
}

/**
 * @description 传入 css string ，返回 postCSS 处理后的 css string
 * @param {string} css
 * @param {string} filePath
 * @param {object} projectConfig
 * @returns {Function | any}
 */
function postCSS ({ css, filePath, projectConfig }) {
  const pxTransformConfig = {
    designWidth: projectConfig.designWidth || 750
  }
  if (projectConfig.hasOwnProperty(DEVICE_RATIO)) {
    pxTransformConfig[DEVICE_RATIO] = projectConfig.deviceRatio
  }
  return postcss([
    require('stylelint')(stylelintConfig),
    require('postcss-reporter')({clearReportedMessages: true}),
    pxtransform(
      {
        platform: 'rn',
        ...pxTransformConfig
      }
    )
  ])
    .process(css, {from: filePath})
    .then((result) => {
      return {
        css: result.css,
        filePath
      }
    })
}

function getStyleObject ({css, filePath}) {
  let styleObject = {}
  try {
    styleObject = transformCSS(css)
  } catch (err) {
    Util.printLog(processTypeEnum.WARNING, 'css-to-react-native 报错', filePath)
    console.log(chalk.red(err.stack))
  }
  return styleObject
}

function validateStyle ({styleObject, filePath}) {
  for (const name in styleObject) {
    try {
      StyleSheetValidation.validateStyle(name, styleObject)
    } catch (err) {
      Util.printLog(processTypeEnum.WARNING, '样式不支持', filePath)
      console.log(chalk.red(err.message))
    }
  }
}

function writeStyleFile ({css, tempFilePath}) {
  const fileContent = `import { StyleSheet } from 'react-native'\n\nexport default StyleSheet.create(${css})`
  fs.ensureDirSync(path.dirname(tempFilePath))
  fs.writeFileSync(tempFilePath, fileContent)
  Util.printLog(processTypeEnum.GENERATE, '生成文件', tempFilePath)
}

export {
  loadStyle,
  postCSS,
  getStyleObject,
  validateStyle,
  writeStyleFile
}
