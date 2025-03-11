import React, { useState, useEffect, useCallback, useRef } from 'react';

function DataPreview({ data, onSelectionChange }) {
  // 使用ref跟踪是否已经初始化
  const initializedRef = useRef(false);
  
  // 使用filteredIndex作为选中状态的键
  const [selectedItems, setSelectedItems] = useState({});
  
  // 过滤掉非产品项（如小计、折扣等）并按来源分组数据
  const { groupedData, filteredData } = React.useMemo(() => {
    console.log('Running data filtering and grouping');
    const groups = {};
    
    // 过滤掉非产品项
    const filtered = data.filter(item => {
      // 只保留有效的产品项
      return item['Product or service'] && 
             !['Subtotal', 'Discount 15%', 'Sales tax', 'Payment'].includes(item['Product or service']);
    });
    
    // 为每个过滤后的项目添加一个新的索引
    const indexedData = filtered.map((item, index) => ({
      ...item,
      filteredIndex: index
    }));
    
    // 按来源分组
    indexedData.forEach(item => {
      const source = item.source || '未知来源';
      if (!groups[source]) {
        groups[source] = [];
      }
      groups[source].push(item);
    });
    
    return { groupedData: groups, filteredData: indexedData };
  }, [data]); // 只依赖于data
  
  // 当数据变化时重置选中状态 - 使用ref防止循环
  useEffect(() => {
    // 只在数据真正变化时重置选择状态
    const dataKey = JSON.stringify(data.map(item => item.source));
    
    if (initializedRef.current) {
      console.log('Data changed, resetting selection');
      setSelectedItems({});
      if (onSelectionChange) {
        onSelectionChange([]);
      }
    } else {
      initializedRef.current = true;
    }
  }, [data]); // 只依赖于data，移除onSelectionChange依赖

  // 处理复选框变化 - 使用useCallback避免不必要的重新创建
  const handleCheckboxChange = useCallback((filteredIndex) => {
    console.log('Checkbox change for index:', filteredIndex);
    
    setSelectedItems(prevState => {
      const newState = {
        ...prevState,
        [filteredIndex]: !prevState[filteredIndex]
      };
      
      // 找出所有选中的项目
      const selectedData = filteredData.filter(item => newState[item.filteredIndex]);
      
      // 通知父组件
      if (onSelectionChange) {
        onSelectionChange(selectedData);
      }
      
      return newState;
    });
  }, [filteredData, onSelectionChange]);
  
  // 处理全选/取消全选
  const handleSelectAllInGroup = useCallback((source, isSelected) => {
    console.log('Select all for source:', source, 'isSelected:', isSelected);
    
    setSelectedItems(prevState => {
      const newState = { ...prevState };
      const groupItems = groupedData[source] || [];
      
      // 为该组中的所有项目设置选中状态
      groupItems.forEach(item => {
        newState[item.filteredIndex] = isSelected;
      });
      
      // 找出所有选中的项目
      const selectedData = filteredData.filter(item => newState[item.filteredIndex]);
      
      // 通知父组件
      if (onSelectionChange) {
        onSelectionChange(selectedData);
      }
      
      return newState;
    });
  }, [groupedData, filteredData, onSelectionChange]);
  
  // 检查组是否全部选中
  const isGroupAllSelected = useCallback((source) => {
    const groupItems = groupedData[source] || [];
    return groupItems.length > 0 && groupItems.every(item => !!selectedItems[item.filteredIndex]);
  }, [groupedData, selectedItems]);
  
  // 检查组是否部分选中
  const isGroupPartiallySelected = useCallback((source) => {
    const groupItems = groupedData[source] || [];
    return groupItems.some(item => !!selectedItems[item.filteredIndex]) && 
           !groupItems.every(item => !!selectedItems[item.filteredIndex]);
  }, [groupedData, selectedItems]);
  
  // 获取组中选中的项目数量
  const getSelectedCountInGroup = useCallback((source) => {
    const groupItems = groupedData[source] || [];
    return groupItems.filter(item => !!selectedItems[item.filteredIndex]).length;
  }, [groupedData, selectedItems]);

  const signatureRow = 24; // 签名行开始的行号，我们不会修改这一行及之后的内容

  // 如果没有数据，显示提示信息
  if (!filteredData || filteredData.length === 0 || Object.keys(groupedData).length === 0) {
    return (
      <div style={noDataStyle}>
        <p>没有可显示的数据</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h3 style={titleStyle}>提取的数据</h3>
      
      {Object.keys(groupedData).map(source => (
        <div key={source} style={groupContainerStyle}>
          <div style={groupHeaderStyle}>
            <div style={groupTitleContainerStyle}>
              <input
                type="checkbox"
                checked={isGroupAllSelected(source)}
                ref={el => {
                  if (el) {
                    el.indeterminate = isGroupPartiallySelected(source);
                  }
                }}
                onChange={(e) => handleSelectAllInGroup(source, e.target.checked)}
                style={checkboxStyle}
              />
              <h4 style={groupTitleStyle}>
                {source} 
                <span style={groupCountStyle}>
                  ({getSelectedCountInGroup(source)}/{groupedData[source].length})
                </span>
              </h4>
            </div>
          </div>
          
          <div style={listContainerStyle}>
            {groupedData[source].map((item) => (
              <div 
                key={item.filteredIndex} 
                style={{
                  ...itemStyle,
                  ...(selectedItems[item.filteredIndex] ? selectedItemStyle : {})
                }}
              >
                <div 
                  style={checkboxLabelStyle}
                  onClick={() => handleCheckboxChange(item.filteredIndex)}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedItems[item.filteredIndex]}
                    onChange={() => {}} // 空的onChange防止React警告
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckboxChange(item.filteredIndex);
                    }}
                    style={checkboxStyle}
                  />
                  <div style={itemContentStyle}>
                    <div style={itemHeaderStyle}>
                      <span style={itemNumberStyle}>{item['#'] || ''}</span>
                      <span style={itemProductStyle}>{item['Product or service'] || ''}</span>
                      <span style={itemQtyStyle}>{item['Qty'] || ''}</span>
                    </div>
                    <div style={itemDescriptionStyle}>
                      {item['Description'] || ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// 样式定义
const containerStyle = {
  marginTop: '1.5rem',
  marginBottom: '1.5rem'
};

const titleStyle = {
  fontSize: '1.25rem',
  fontWeight: '600',
  marginBottom: '1rem',
  color: '#2563eb'
};

const groupContainerStyle = {
  marginBottom: '1.5rem'
};

const groupHeaderStyle = {
  backgroundColor: '#f9fafb',
  padding: '0.75rem',
  borderRadius: '0.375rem 0.375rem 0 0',
  borderTop: '1px solid #e5e7eb',
  borderLeft: '1px solid #e5e7eb',
  borderRight: '1px solid #e5e7eb'
};

const groupTitleContainerStyle = {
  display: 'flex',
  alignItems: 'center'
};

const groupTitleStyle = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: '600',
  color: '#4b5563'
};

const groupCountStyle = {
  fontSize: '0.875rem',
  color: '#6b7280',
  fontWeight: 'normal',
  marginLeft: '0.5rem'
};

const listContainerStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: '0 0 0.375rem 0.375rem',
  overflow: 'hidden'
};

const itemStyle = {
  padding: '0.75rem',
  borderBottom: '1px solid #e5e7eb',
  transition: 'background-color 0.2s ease',
  cursor: 'pointer',
  userSelect: 'none'
};

const selectedItemStyle = {
  backgroundColor: '#e0f2fe'
};

const checkboxLabelStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  cursor: 'pointer',
  width: '100%'
};

const checkboxStyle = {
  marginRight: '0.75rem',
  marginTop: '0.25rem',
  cursor: 'pointer',
  width: '18px',
  height: '18px'
};

const itemContentStyle = {
  flex: '1',
  display: 'flex',
  flexDirection: 'column'
};

const itemHeaderStyle = {
  display: 'flex',
  marginBottom: '0.25rem'
};

const itemNumberStyle = {
  width: '2rem',
  fontWeight: '600',
  color: '#4b5563'
};

const itemProductStyle = {
  flex: '1',
  fontWeight: '600',
  color: '#1f2937'
};

const itemQtyStyle = {
  width: '3rem',
  textAlign: 'right',
  color: '#4b5563'
};

const itemDescriptionStyle = {
  color: '#6b7280',
  fontSize: '0.875rem'
};

const noDataStyle = {
  padding: '1rem',
  textAlign: 'center',
  color: '#6b7280',
  backgroundColor: '#f9fafb',
  borderRadius: '0.375rem',
  border: '1px solid #e5e7eb'
};

export default DataPreview; 