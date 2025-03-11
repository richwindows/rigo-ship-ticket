import React, { useEffect, useCallback, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

// 设置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function DataExtractor({ pdfFile, onDataExtracted, setIsLoading, setError }) {
  // 使用 ref 来跟踪是否已经处理过当前文件
  const processedFileRef = useRef(null);
  // 使用 state 来跟踪处理状态
  const [isProcessing, setIsProcessing] = useState(false);
  
  // 解析行内容 - 移到外部避免依赖项问题
  const parseLine = useCallback((line) => {
    // 使用多个空格作为分隔符
    return line.split(/\s{2,}/).map(item => item.trim()).filter(item => item);
  }, []);
  
  // 判断一行是否是表格行 - 移到外部避免依赖项问题
  const isTableRow = useCallback((line) => {
    // 表格行通常包含多个数字和分隔符
    const hasNumbers = /\d+/.test(line);
    const hasDollarAmount = /\$\d+(\.\d+)?/.test(line);
    const hasMultipleSpaces = /\s{2,}/.test(line);
    
    return (hasNumbers || hasDollarAmount) && hasMultipleSpaces;
  }, []);
  
  // 按位置排序文本项 - 移到外部避免依赖项问题
  const sortTextItemsByPosition = useCallback((items) => {
    // 创建文本项的副本
    const itemsCopy = [...items];
    
    // 按照 y 坐标（行）和 x 坐标（列）排序
    return itemsCopy.sort((a, b) => {
      // 定义行高阈值，如果两个项的 y 坐标差小于此值，则认为它们在同一行
      const lineHeightThreshold = 5;
      const yDiff = a.transform[5] - b.transform[5];
      
      if (Math.abs(yDiff) <= lineHeightThreshold) {
        // 如果在同一行，按 x 坐标排序
        return a.transform[4] - b.transform[4];
      }
      
      // 否则按 y 坐标排序（从上到下）
      return b.transform[5] - a.transform[5];
    });
  }, []);
  
  // 提取带有结构的文本 - 使用 useCallback 并添加依赖项
  const extractTextWithStructure = useCallback((sortedItems) => {
    let text = '';
    let currentY = null;
    let currentLine = [];
    const tableData = [];
    let tableRow = [];
    
    // 保存每个文本项的原始位置信息，用于后续分析
    const itemsWithPosition = [];
    
    // 处理每个文本项
    sortedItems.forEach((item, index) => {
      const y = item.transform[5];
      const x = item.transform[4];
      const content = item.str.trim();
      
      // 保存位置信息
      if (content) {
        itemsWithPosition.push({
          content,
          x,
          y,
          width: item.width || 0,
          height: item.height || 0,
          transform: item.transform
        });
      }
      
      // 如果是新的一行
      if (currentY === null || Math.abs(y - currentY) > 5) {
        // 处理前一行
        if (currentLine.length > 0) {
          const line = currentLine.join(' ');
          text += line + '\n';
          
          // 检查是否是表格行
          if (isTableRow(line)) {
            tableRow = parseLine(line);
            if (tableRow.length >= 3) {
              tableData.push(tableRow);
            }
          }
        }
        
        // 开始新的一行
        currentLine = [content];
        currentY = y;
      } else {
        // 继续当前行
        if (content) {
          currentLine.push(content);
        }
      }
      
      // 处理最后一项
      if (index === sortedItems.length - 1 && currentLine.length > 0) {
        const line = currentLine.join(' ');
        text += line + '\n';
        
        // 检查是否是表格行
        if (isTableRow(line)) {
          tableRow = parseLine(line);
          if (tableRow.length >= 3) {
            tableData.push(tableRow);
          }
        }
      }
    });
    
    return { text, tableData, itemsWithPosition };
  }, [isTableRow, parseLine]);
  
  // 提取估算信息 - 使用 useCallback
  const extractEstimateInfo = useCallback((text) => {
    const info = {};
    
    // 提取估算编号
    const estimateNoMatch = text.match(/Estimate\s+no\.?\s*:?\s*(\d+)/i);
    if (estimateNoMatch && estimateNoMatch[1]) {
      info.estimateNo = estimateNoMatch[1].trim();
    }
    
    // 提取估算日期
    const dateMatch = text.match(/Estimate\s+date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (dateMatch && dateMatch[1]) {
      info.estimateDate = dateMatch[1].trim();
    }
    
    return info;
  }, []);
  
  // 查找表头行和列标题
  const findTableHeaders = useCallback((items) => {
    // 定义我们要查找的列标题，与图片中完全一致
    const columnTitles = ["#", "Product or service", "Description", "Qty", "Rate", "Amount"];
    
    // 查找包含这些标题的项
    const headerItems = [];
    let headerY = null;
    
    // 首先尝试找到包含 "Product" 或 "Description" 的行，确定表头的 Y 坐标
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (columnTitles.some(title => item.content.includes(title))) {
        if (headerY === null) {
          headerY = item.y;
        } else if (Math.abs(item.y - headerY) <= 5) {
          headerItems.push(item);
        }
      }
    }
    
    // 如果找到了一些表头项，再次遍历所有项，找出在同一行的所有项
    if (headerY !== null) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (Math.abs(item.y - headerY) <= 5 && !headerItems.includes(item)) {
          headerItems.push(item);
        }
      }
    }
    
    // 按 X 坐标排序
    headerItems.sort((a, b) => a.x - b.x);
    
    return { headerItems, headerY };
  }, []);
  
  // 确定表格的列结构
  const determineColumnStructure = useCallback((headerItems) => {
    if (headerItems.length === 0) return null;
    
    // 定义我们期望的列名，与图片中完全一致
    const expectedColumns = ["#", "Product or service", "Description", "Qty", "Rate", "Amount"];
    
    // 创建列结构
    const columns = [];
    
    // 尝试匹配每个表头项到预期的列名
    for (let i = 0; i < headerItems.length; i++) {
      const item = headerItems[i];
      
      // 找到最匹配的列名
      let bestMatch = null;
      let bestMatchScore = 0;
      
      for (const colName of expectedColumns) {
        if (item.content.includes(colName)) {
          const score = colName.length;
          if (score > bestMatchScore) {
            bestMatch = colName;
            bestMatchScore = score;
          }
        }
      }
      
      // 如果找到匹配，添加列
      if (bestMatch) {
        columns.push({
          name: bestMatch,
          startX: item.x - 5, // 稍微扩大列的范围，以捕获更多内容
          endX: i < headerItems.length - 1 ? headerItems[i + 1].x - 5 : Infinity,
          index: expectedColumns.indexOf(bestMatch)
        });
      } else {
        // 如果没有匹配，使用内容作为列名
        columns.push({
          name: item.content,
          startX: item.x - 5,
          endX: i < headerItems.length - 1 ? headerItems[i + 1].x - 5 : Infinity,
          index: 999 // 给未知列一个大索引
        });
      }
    }
    
    // 按预期顺序排序列
    columns.sort((a, b) => a.index - b.index);
    
    return columns;
  }, []);
  
  // 提取表格数据行
  const extractTableRows = useCallback((items, headerY, columns) => {
    if (!columns || columns.length === 0 || headerY === null) return [];
    
    // 按 Y 坐标分组项，创建行
    const rows = {};
    
    // 只处理在表头下方的项
    const tableItems = items.filter(item => item.y < headerY - 5); // 表头下方的项 Y 坐标更小
    
    // 按 Y 坐标分组
    tableItems.forEach(item => {
      // 四舍五入 Y 坐标以分组相近的行
      const roundedY = Math.round(item.y);
      if (!rows[roundedY]) {
        rows[roundedY] = [];
      }
      rows[roundedY].push(item);
    });
    
    // 处理每一行
    const tableData = [];
    
    // 按 Y 坐标排序（从上到下）
    const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
    
    for (const y of sortedYs) {
      const rowItems = rows[y];
      
      // 创建行数据对象
      const rowData = {};
      
      // 将每个项分配到对应的列
      rowItems.forEach(item => {
        for (const column of columns) {
          if (item.x >= column.startX && (column.endX === Infinity || item.x < column.endX)) {
            // 如果该列已有内容，则追加
            if (rowData[column.name]) {
              rowData[column.name] += ' ' + item.content;
            } else {
              rowData[column.name] = item.content;
            }
            break;
          }
        }
      });
      
      // 只添加包含足够数据的行
      if (Object.keys(rowData).length >= 2) {
        tableData.push(rowData);
      }
    }
    
    return tableData;
  }, []);
  
  // 提取产品信息 - 使用 useCallback 并添加依赖项
  const extractProductInfo = useCallback((text, itemsWithPosition) => {
    // 使用基于位置的方法提取表格数据
    if (itemsWithPosition && itemsWithPosition.length > 0) {
      // 查找表头行和列标题
      const { headerItems, headerY } = findTableHeaders(itemsWithPosition);
      
      if (headerItems.length > 0 && headerY !== null) {
        // 确定列结构
        const columns = determineColumnStructure(headerItems);
        
        if (columns && columns.length > 0) {
          // 提取表格数据行
          const tableData = extractTableRows(itemsWithPosition, headerY, columns);
          
          if (tableData.length > 0) {
            console.log('基于位置提取的表格数据:', tableData);
            
            // 直接使用提取的数据，保持列的完整性
            const processedData = [];
            
            // 使用Set来跟踪已处理的项目，避免重复
            const processedItems = new Set();
            
            for (const row of tableData) {
              const processedRow = {};
              
              // 处理每一列，保持原始数据
              for (const column of columns) {
                const columnName = column.name;
                if (row[columnName]) {
                  processedRow[columnName] = row[columnName].trim();
                } else {
                  processedRow[columnName] = '';
                }
              }
              
              // 确保至少有 Product or service 和 Description 列
              if (processedRow['Product or service'] || processedRow['Description']) {
                // 清理 Qty 列，只保留数字
                if (processedRow['Qty']) {
                  const qtyMatch = processedRow['Qty'].match(/^(\d+)/);
                  if (qtyMatch) {
                    processedRow['Qty'] = qtyMatch[1];
                  }
                }
                
                // 创建唯一标识符，用于检测重复
                const itemKey = `${processedRow['#']}-${processedRow['Product or service']}-${processedRow['Description']}`;
                
                // 只添加未处理过的项目
                if (!processedItems.has(itemKey)) {
                  processedItems.add(itemKey);
                  processedData.push(processedRow);
                }
              }
            }
            
            console.log('处理后的表格数据:', processedData);
            return processedData;
          }
        }
      }
    }
    
    console.log('基于位置的提取失败，回退到基于文本的方法');
    
    // 如果基于位置的方法失败，回退到基于文本的方法
    // 这里我们将使用更精确的方法来提取与图片中完全一致的数据
    
    const products = [];
    const lines = text.split('\n');
    
    // 查找包含 "Product or service" 和 "Description" 的行
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('Product or service') && line.includes('Description')) {
        headerIndex = i;
        break;
      }
    }
    
    // 使用Set来跟踪已处理的项目，避免重复
    const processedItems = new Set();
    
    if (headerIndex >= 0) {
      // 处理表格数据
      for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 跳过空行
        if (!line) continue;
        
        // 分割行内容
        const parts = parseLine(line);
        
        // 如果行包含足够的部分，可能是表格行
        if (parts.length >= 3) {
          // 尝试识别行号、产品代码、描述和数量
          let rowNum = '';
          let productCode = '';
          let description = '';
          let qty = '';
          
          // 检查第一部分是否是行号
          if (/^\d+\.?$/.test(parts[0])) {
            rowNum = parts[0].replace('.', '');
            
            // 如果第二部分存在，可能是产品代码
            if (parts.length > 1) {
              productCode = parts[1];
            }
            
            // 如果第三部分存在，可能是描述
            if (parts.length > 2) {
              description = parts[2];
            }
            
            // 如果第四部分存在，可能是数量
            if (parts.length > 3) {
              qty = parts[3];
            }
          } else {
            // 如果第一部分不是行号，可能是产品代码
            productCode = parts[0];
            
            // 如果第二部分存在，可能是描述
            if (parts.length > 1) {
              description = parts[1];
            }
            
            // 如果第三部分存在，可能是数量
            if (parts.length > 2) {
              qty = parts[2];
            }
          }
          
          // 创建唯一标识符，用于检测重复
          const itemKey = `${rowNum}-${productCode}-${description}`;
          
          // 只添加未处理过的项目
          if (!processedItems.has(itemKey) && (productCode || description)) {
            processedItems.add(itemKey);
            
            // 添加产品
            products.push({
              '#': rowNum,
              'Product or service': productCode,
              'Description': description,
              'Qty': qty
            });
          }
        }
      }
    }
    
    // 过滤掉可能的非产品行，如小计、折扣等
    return products.filter(item => {
      const productCode = item['Product or service'] || '';
      return !['Subtotal', 'Discount', 'Sales tax', 'Payment'].some(
        keyword => productCode.includes(keyword)
      );
    });
  }, [parseLine, findTableHeaders, determineColumnStructure, extractTableRows]);
  
  // 使用 useCallback 包装 extractDataFromPDF 函数，并添加所有依赖项
  const extractDataFromPDF = useCallback(async (pdf) => {
    const numPages = pdf.numPages;
    console.log(`PDF 共有 ${numPages} 页`);
    
    let allTextContent = '';
    let allItemsWithPosition = [];
    let extractedData = {};
    
    try {
      // 遍历所有页面提取文本
      for (let i = 1; i <= numPages; i++) {
        console.log(`处理第 ${i} 页`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // 按照位置排序文本项，以保持原始顺序
        const sortedItems = sortTextItemsByPosition(textContent.items);
        
        // 识别并保留表格结构
        const { text, tableData, itemsWithPosition } = extractTextWithStructure(sortedItems);
        
        allTextContent += text + '\n\n';
        allItemsWithPosition = allItemsWithPosition.concat(itemsWithPosition);
        
        console.log(`第 ${i} 页文本:`, text.substring(0, 200) + '...');
        
        if (tableData.length > 0) {
          console.log(`第 ${i} 页表格数据:`, tableData);
          if (!extractedData.tables) {
            extractedData.tables = [];
          }
          extractedData.tables.push(tableData);
        }
      }
      
      console.log('所有文本内容:', allTextContent);
      
      // 提取估算信息
      const estimateInfo = extractEstimateInfo(allTextContent);
      if (Object.keys(estimateInfo).length > 0) {
        extractedData.estimateInfo = estimateInfo;
      }
      
      // 提取产品信息
      const products = extractProductInfo(allTextContent, allItemsWithPosition);
      if (products.length > 0) {
        extractedData.products = products;
      }
      
      // 如果没有提取到结构化数据，至少返回原始文本
      if (Object.keys(extractedData).length === 0) {
        extractedData.rawText = allTextContent;
      }
      
      console.log('提取的结构化数据:', extractedData);
    } catch (error) {
      console.error('提取文本时出错:', error);
      extractedData.error = error.message;
    }
    
    return extractedData;
  }, [sortTextItemsByPosition, extractTextWithStructure, extractEstimateInfo, extractProductInfo]);
  
  useEffect(() => {
    // 如果没有文件、已经处理过相同的文件或者正在处理中，则不执行
    if (!pdfFile || processedFileRef.current === pdfFile.name || isProcessing) {
      return;
    }
    
    const extractData = async () => {
      try {
        // 设置处理状态为 true
        setIsProcessing(true);
        setIsLoading(true);
        setError(null);
        
        // 从文件中读取 PDF
        const fileReader = new FileReader();
        
        fileReader.onload = async function() {
          try {
            const typedArray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedArray).promise;
            
            // 提取数据的逻辑
            const extractedData = await extractDataFromPDF(pdf);
            
            // 在控制台显示提取的数据
            console.log('提取的数据:', extractedData);
            
            // 记录已处理的文件名
            processedFileRef.current = pdfFile.name;
            
            // 确保只调用一次onDataExtracted
            onDataExtracted(extractedData);
          } catch (err) {
            console.error('PDF 处理错误:', err);
            setError('PDF 处理过程中出错: ' + err.message);
          } finally {
            setIsLoading(false);
            // 设置处理状态为 false
            setIsProcessing(false);
          }
        };
        
        fileReader.onerror = function() {
          setError('文件读取错误');
          setIsLoading(false);
          setIsProcessing(false);
        };
        
        fileReader.readAsArrayBuffer(pdfFile);
      } catch (err) {
        console.error('数据提取错误:', err);
        setError('数据提取过程中出错: ' + err.message);
        setIsLoading(false);
        setIsProcessing(false);
      }
    };

    // 确保只执行一次提取
    extractData();
    
    // 清理函数
    return () => {
      // 如果组件卸载，可以在这里执行清理操作
    };
  }, [pdfFile, onDataExtracted, setIsLoading, setError, extractDataFromPDF, isProcessing]);
  
  return (
    <div style={{ marginTop: '1rem' }}>
      {/* 这里可以添加一些 UI 元素，如果需要的话 */}
    </div>
  );
}

export default DataExtractor;