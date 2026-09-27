import React from 'react'
import { Animated, Dimensions, Easing, Pressable, Text, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { type AppleTypographyRole } from '@/design/theme'
import { stageTypography } from '../../stage-ratio'
import { Icon } from './stage-five-icons'
import type { IconName } from './stage-five-icons'
import { TW } from './stage-five-tokens'
import { stageFiveText, type StageFiveLanguage } from './stage-five-copy'
let gradientId = 0
export class Paint extends React.PureComponent<{primary?:boolean; tint?:boolean; background?:boolean}> {
 private id = `tw-paint-${++gradientId}`
 render(){const {primary,tint,background}=this.props;return <View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,overflow:'hidden'}}><Svg width="100%" height="100%"><Defs>{primary ? <LinearGradient id={this.id} x1="0%" y1="0%" x2="75%" y2="100%"><Stop offset="0%" stopColor="#2AD9B3"/><Stop offset="58%" stopColor="#02B49B"/><Stop offset="100%" stopColor="#009783"/></LinearGradient> : <RadialGradient id={this.id} cx={background?'52%':'8%'} cy={background?'48%':'0%'} rx="90%" ry="80%"><Stop offset="0%" stopColor={background?'#EAFBF7':tint?'#E5FFF5':'#FFFFFF'}/><Stop offset="100%" stopColor={background?'#FBFDFE':tint?'#F5FFFC':'#FAFDFE'}/></RadialGradient>}</Defs><Rect x="0" y="0" width="100%" height="100%" fill={`url(#${this.id})`}/></Svg></View>}
}
export function Copy({children,windowWidth,role='subheadline',weight='400',color=TW.color.ink,style={},lines}:{children:React.ReactNode;windowWidth:number;role?:AppleTypographyRole;weight?:'400'|'500'|'600'|'700';color?:string;style?:object;lines?:number}) {
 return <Text selectable numberOfLines={lines} style={[stageTypography(role,windowWidth),{fontWeight:weight,color,position:'relative',zIndex:1},style]}>{children}</Text>
}
export function Box({children,s=1,height,style={},tint=false}:{children:React.ReactNode;s?:number;height?:number;style?:ViewStyle;tint?:boolean}) {
 return <View style={[{minHeight:height?height*s:undefined,borderRadius:22*s,borderWidth:1,borderColor:TW.color.line,backgroundColor:'#FFFFFF',overflow:'hidden',boxShadow:TW.shadow},style]}><Paint tint={tint}/>{children}</View>
}
export function IconSlot({name,s=1,size=40,coral=false,blue=false}:{name:IconName;s?:number;size?:number;coral?:boolean;blue?:boolean}) {
 return <View style={{width:size*s,height:size*s,alignItems:'center',justifyContent:'center'}}><Icon name={name} size={(size>44?38:29)*s} color={coral?'#F18F83':blue?'#087ADE':'#009A83'}/></View>
}
export function Tap({children,s=1,onPress,label,disabled=false,style={},testID}:{children:React.ReactNode;s?:number;onPress?:()=>void;label:string;disabled?:boolean;style?:ViewStyle;testID?:string}) {
 return <Pressable testID={testID} onPress={onPress} disabled={disabled||!onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:disabled||!onPress}} style={({pressed})=>[{minHeight:Math.max(44,38*s),justifyContent:'center',opacity:disabled||!onPress?0.42:pressed?0.76:1,transform:[{scale:pressed?0.98:1}]},style]}>{children}</Pressable>
}
/** Holds the work cards at their approved vertical offset; the heading is exposed to screen readers only. */
export function Header({s,language='vi'}:{s:number;language?:StageFiveLanguage}) {
 return <View accessible accessibilityRole="header" accessibilityLabel={stageFiveText(language,'Đang thực hiện công việc','Work in progress')} style={{height:96*s}}/>
}
export function Primary({label,s,windowWidth,onPress,busy,disabled,testID,language='vi'}:{label:string;s:number;windowWidth:number;onPress?:()=>void;busy?:boolean;disabled?:boolean;testID?:string;language?:StageFiveLanguage}) {
 return <Tap s={s} label={label} onPress={onPress} disabled={disabled||busy} testID={testID} style={{height:56*s,minHeight:48,borderRadius:32*s,overflow:'hidden',boxShadow:TW.buttonShadow,backgroundColor:TW.color.teal}}><Paint primary/><View style={{flexDirection:'row',alignItems:'center',justifyContent:'center'}}><Copy role="headline" weight="600" color="#FFF" windowWidth={windowWidth}>{busy?stageFiveText(language,'Đang xử lý…','Working…'):label}</Copy></View></Tap>
}
export function Caution({s,windowWidth,children}:{s:number;windowWidth:number;children:React.ReactNode}) {return <View style={{flexDirection:'row',gap:9*s,justifyContent:'center',alignItems:'center',paddingTop:15*s,paddingBottom:12*s}}><Icon name="info" size={20*s} color="#527490"/><Copy role="caption1" color={TW.color.body} windowWidth={windowWidth}>{children}</Copy></View>}
export function ToolTile({s,windowWidth,label,detail,icon,onPress,coral=false,testID,grow=1}:{s:number;windowWidth:number;label:string;grow?:number;detail?:string|null;icon:IconName;onPress?:()=>void;coral?:boolean;testID?:string}){
 return <Box s={s} style={{flex:grow,borderRadius:20*s}}><Tap s={s} label={label} onPress={onPress} testID={testID} style={{alignItems:'center',paddingVertical:13*s,paddingHorizontal:4*s,minHeight:100*s,gap:5*s}}><IconSlot name={icon} s={s} coral={coral}/><Copy role="caption1" color={TW.color.body} style={{textAlign:'center'}} windowWidth={windowWidth}>{label}</Copy>{detail?<Copy role="caption2" color={TW.color.body} style={{textAlign:'center',marginTop:-3*s}} windowWidth={windowWidth}>{detail}</Copy>:null}</Tap></Box>
}
export class Pulse extends React.PureComponent<{children:React.ReactNode;reduceMotion?:boolean}> {
 private value=new Animated.Value(1)
 private animation:Animated.CompositeAnimation|null=null
 componentDidMount(){this.start()}
 componentDidUpdate(p:Readonly<{children:React.ReactNode;reduceMotion?:boolean}>){if(p.reduceMotion!==this.props.reduceMotion)this.start()}
 componentWillUnmount(){this.animation?.stop()}
 private start(){this.animation?.stop();this.value.setValue(1);if(this.props.reduceMotion)return;this.animation=Animated.loop(Animated.sequence([Animated.timing(this.value,{toValue:.55,duration:1300,easing:Easing.inOut(Easing.cubic),useNativeDriver:true}),Animated.timing(this.value,{toValue:1,duration:1300,easing:Easing.inOut(Easing.cubic),useNativeDriver:true})]));this.animation.start()}
 render(){return <Animated.View style={{opacity:this.value}}>{this.props.children}</Animated.View>}
}
export class SurfaceFrame extends React.Component<{children:(s:number,windowWidth:number)=>React.ReactNode;testID:string},{width:number}> {
 state={width:446}
 render(){const s=Math.max(.68,Math.min(1.25,this.state.width/446));const windowWidth=Dimensions.get('window').width;return <View testID={this.props.testID} onLayout={e=>{const w=e.nativeEvent.layout.width;if(w>0&&Math.abs(w-this.state.width)>.5)this.setState({width:w})}} style={{width:'100%',alignSelf:'center',backgroundColor:TW.color.canvas,minHeight:894*s,overflow:'hidden'}}><Paint background/><View style={{paddingHorizontal:12*s,paddingTop:2*s}}>{this.props.children(s,windowWidth)}</View></View>}
}
